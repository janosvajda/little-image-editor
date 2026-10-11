import {
	type ConnectorTool,
	type PathTool,
	PathToolId,
	MarkupToolId,
	type MarkupTool,
	type PaintTool,
	PaintToolId,
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId, LayerKind } from '../../core/layers/layerTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type TextAnnotation,
} from '../annotations/annotationTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import {
	type CanvasViewportController,
	ZoomDirection,
} from '../workspace/canvasViewportController';
import { CropTool } from './cropTool';
import { drawingLayerTargetAt } from './drawingLayerTarget';
import { DrawingImageActions } from './drawingImageActions';
import { isConnectorTool, isMarkupTool, isPaintTool, isPathTool, isShapeTool } from './drawingToolBehavior';
import { GradientHandles } from './gradientHandles';
import { PathPointEditor } from './pathPointEditor';
import { PenPieces, PenTool } from './penTool';
import { ToolColorTarget } from './toolColorsControl';
import { ConnectorDrawingGesture } from './gestures/connectorDrawingGesture';
import type { DrawingToolSettings } from './drawingToolSettings';
import { BaseImagePaintGesture } from './gestures/baseImagePaintGesture';
import type { DrawingGesture } from './gestures/drawingGesture';
import { ObjectErasureGesture } from './gestures/objectErasureGesture';
import { PaintStrokeGesture } from './gestures/paintStrokeGesture';
import { ShapeDrawingGesture } from './gestures/shapeDrawingGesture';
import { isFramedMarkupTool, MarkupActions } from './markupActions';
import { ObjectInteractionTool } from './objectInteractionTool';

/** Chooses a tool action. Each returned gesture owns its own mutation and lifecycle. */
export class DrawingToolRouter {
	readonly #crop: CropTool;
	readonly #objects: ObjectInteractionTool;
	readonly #imageActions: DrawingImageActions;
	readonly #markup: MarkupActions | null;
	/** The Pen and the Polyline, each drawing its own kind of path. */
	readonly #pens: Readonly<Record<PathTool, PenTool>> | null;
	/** The one of them that last began a path, which Enter finishes and Escape drops. */
	#pen: PenTool | null = null;
	readonly #pathPoints: PathPointEditor | null;
	readonly #gradients: GradientHandles | null;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly shapes: AnnotationDocument | undefined,
		private readonly viewport: CanvasViewportController | undefined,
		rasterSelection: RasterSelection | undefined,
		private readonly settings: DrawingToolSettings,
	) {
		this.#crop = new CropTool(documentModel, shapes, viewport);
		this.#objects = new ObjectInteractionTool(shapes, rasterSelection);
		this.#imageActions = new DrawingImageActions(documentModel, shapes);
		this.#markup = shapes ? new MarkupActions(documentModel, shapes) : null;
		const penStyle = () => ({ stroke: settings.strokeOptions(), shapeStyle: settings.shapeStyle, fillColor: settings.fillColor, ends: settings.lineEnds() });
		this.#pens = shapes
			? {
					[PathToolId.Pen]: new PenTool(documentModel, shapes, penStyle, PenPieces.Curves),
					[PathToolId.Polyline]: new PenTool(documentModel, shapes, penStyle, PenPieces.Straight),
				}
			: null;
		this.#pathPoints = shapes ? new PathPointEditor(documentModel, shapes) : null;
		this.#gradients = shapes ? new GradientHandles(documentModel, shapes, () => this.editingPathPoints) : null;
		// Point marks and gradient points share the overlay; the gradient's come back when point editing ends.
		this.#pathPoints?.onEditingChange(() => this.#gradients?.render());
	}

	/** Edits a text item in place, as a double-click on it does with any tool. */
	editText(
		item: TextAnnotation,
		client: Readonly<{ clientX: number; clientY: number }>,
	): void {
		this.#markup?.editText(item, client);
	}

	cancelCrop(): void {
		this.#crop.cancel();
	}

	/** Whether the Pen has a path under way, which Enter finishes and Escape drops. */
	get penDrawing(): boolean {
		return this.#pen?.drawing ?? false;
	}
	hoverPen(point: Point): void {
		this.#pen?.hover(point);
	}
	finishPen(): void {
		this.#pen?.finish();
	}
	cancelPen(): void {
		this.#pen?.cancel();
	}

	/** Whether a path's points are being edited, where presses and Delete act on its nodes. */
	get editingPathPoints(): boolean {
		return this.#pathPoints?.editing ?? false;
	}
	editPathPoints(pathId: string): void {
		this.#pathPoints?.edit(pathId);
	}
	stopEditingPathPoints(): void {
		this.#pathPoints?.stop();
	}
	beginPathPointEdit(point: Point, visualScale: number, alternate: boolean): DrawingGesture | null {
		return this.#pathPoints?.begin(point, visualScale, alternate) ?? null;
	}
	onPathPointEditingChange(listener: (editing: boolean) => void): void {
		this.#pathPoints?.onEditingChange(listener);
	}
	/** Gradient points are shown while the tool that moves items is chosen. */
	setGradientHandlesActive(active: boolean): void {
		this.#gradients?.setActive(active);
	}
	beginGradientDrag(point: Point, visualScale: number): DrawingGesture | null {
		return this.#gradients?.begin(point, visualScale) ?? null;
	}
	removeSelectedPathNode(): boolean {
		return this.#pathPoints?.removeSelected() ?? false;
	}
	cursor(tool: Tool, point: Point, visualScale: number): string {
		if (
			(tool === UtilityToolId.Crop || tool === UtilityToolId.Select) &&
			this.#crop.containsSelection(point)
		)
			return 'move';
		return this.#objects.cursor(tool, point, visualScale);
	}

	begin(
		tool: Tool,
		point: Point,
		event: PointerEvent,
		visualScale: number,
	): DrawingGesture | null {
		if (tool === PaintToolId.Eraser)
			return this.beginErasure(point, event.pressure);
		if (isMarkupTool(tool)) return this.beginMarkup(tool, point, event);
		if (isConnectorTool(tool) || isPathTool(tool)) return this.beginLineItem(tool, point, visualScale);
		const shape = isShapeTool(tool)
			? new ShapeDrawingGesture(
					this.documentModel,
					this.shapes,
					tool,
					point,
					() => ({
						...this.settings.strokeOptions(),
						shapeStyle: this.settings.shapeStyle,
						fillColor: this.settings.fillColor,
					}),
				)
			: null;
		if (tool === UtilityToolId.Crop || tool === UtilityToolId.Select) {
			const move = this.#crop.beginMove(point);
			if (move) return move;
			if (tool === UtilityToolId.Select) this.#crop.cancel();
		}
		const editing = this.#objects.begin(tool, point, visualScale, shape);
		if (editing) return editing;
		if (tool === UtilityToolId.Crop)
			return this.#crop.begin(point, this.settings.cropSelectionKind);
		if (isPaintTool(tool)) return this.beginPaint(tool, point, event.pressure);
		if (shape) return shape;
		this.runImmediateTool(tool, point, event);
		return null;
	}

	/** Connectors and paths are items, so they are drawn only where the document keeps items. */
	private beginLineItem(tool: ConnectorTool | PathTool, point: Point, visualScale: number): DrawingGesture | null {
		if (isPathTool(tool)) {
			const pen = this.#pens?.[tool] ?? null;
			// A path under way with the other tool is finished before this one begins.
			if (pen !== this.#pen) this.#pen?.finish();
			this.#pen = pen;
			return pen?.begin(point, visualScale) ?? null;
		}
		if (!this.shapes) return null;
		return new ConnectorDrawingGesture(
			this.documentModel,
			this.shapes,
			point,
			() => this.settings.strokeOptions(),
			() => this.settings.lineEnds(),
		);
	}

	/** Highlight, blur and redaction are dragged out; numbers and text are placed by a click. */
	private beginMarkup(
		tool: MarkupTool,
		point: Point,
		event: PointerEvent,
	): DrawingGesture | null {
		if (!this.#markup) return null;
		const style = this.settings.strokeOptions();
		if (isFramedMarkupTool(tool))
			return this.#markup.beginFrame(tool, point, style);
		if (tool === MarkupToolId.Number) this.#markup.placeNumber(point, style);
		else this.#markup.createText(point, event, style);
		return null;
	}

	private beginPaint(
		tool: PaintTool,
		point: Point,
		pressure: number,
	): DrawingGesture | null {
		// Preserve the CanvasDocument-only integration's existing commit behavior.
		if (!this.shapes)
			return {
				locksScroll: true,
				update: () => undefined,
				complete: () => this.documentModel.commit(),
				cancel: () => undefined,
			};
		const target = this.shapes.activeLayer;
		if (target && !this.shapes.isLayerEditable(target.id)) return null;
		return new PaintStrokeGesture(
			this.shapes,
			this.documentModel,
			tool,
			this.settings.strokeOptions(),
			point,
			pressure,
		);
	}

	/** Targets the visible layer under the press, keeping that target for the whole stroke. */
	private beginErasure(point: Point, pressure: number): DrawingGesture | null {
		const shapes = this.shapes;
		const target = drawingLayerTargetAt(this.documentModel, shapes, point);
		if (!target) return null;
		if (target.kind === LayerKind.Raster) return this.beginImageErasure(point, pressure);
		if (!shapes) return null;
		shapes.activate(target.layerId);
		this.documentModel.layers.select(CoreLayerId.Objects);
		const itemIds = shapes
			.layerItems(target.layerId)
			.filter(
				(item) =>
					shapes.isEditable(item.id) &&
					!(
						item.type === AnnotationObjectTypeId.Stroke &&
						item.points.length === 0
					),
			)
			.map((item) => item.id);
		if (itemIds.length === 0) return null;
		return new ObjectErasureGesture(
			shapes,
			itemIds,
			point,
			pressure,
			this.settings.strokeOptions(),
		);
	}

	private beginImageErasure(
		point: Point,
		pressure: number,
	): DrawingGesture | null {
		if (!this.documentModel.layers.isEditable(CoreLayerId.Image)) return null;
		this.shapes?.activate(null);
		this.documentModel.layers.select(CoreLayerId.Image);
		return new BaseImagePaintGesture(
			this.documentModel,
			PaintToolId.Eraser,
			this.settings.strokeOptions(),
			point,
			pressure,
		);
	}

	private runImmediateTool(
		tool: Tool,
		point: Point,
		event: PointerEvent,
	): void {
		// As painting programs do: a click picks the line colour, Alt/Option-click the fill colour.
		if (tool === UtilityToolId.Picker)
			this.settings.pickColor(this.#imageActions.sampleColor(point), event.altKey ? ToolColorTarget.Fill : ToolColorTarget.Line);
		else if (tool === UtilityToolId.Fill)
			this.#imageActions.fillAt(point, this.settings.fillOptions());
		else if (tool === UtilityToolId.Zoom)
			this.viewport?.zoomAt(
				event.clientX,
				event.clientY,
				event.altKey ? ZoomDirection.Out : ZoomDirection.In,
			);
	}
}
