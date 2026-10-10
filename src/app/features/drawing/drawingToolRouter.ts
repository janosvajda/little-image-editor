import {
	MarkupToolId,
	type MarkupTool,
	type PaintTool,
	PaintToolId,
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
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
import { DrawingImageActions } from './drawingImageActions';
import {
	isMarkupTool,
	isPaintTool,
	isShapeTool,
} from './drawingToolBehavior';
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
		const shape = isShapeTool(tool)
			? new ShapeDrawingGesture(
					this.documentModel,
					this.shapes,
					tool,
					point,
					() => ({
						...this.settings.strokeOptions(),
						fill: this.settings.fillShape,
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

	/** Highlight, blur and redaction are dragged out; numbers and text are placed by a click. */
	private beginMarkup(
		tool: MarkupTool,
		point: Point,
		event: PointerEvent,
	): DrawingGesture | null {
		if (!this.#markup) return null;
		const style = this.settings.strokeOptions();
		if (isFramedMarkupTool(tool)) return this.#markup.beginFrame(tool, point, style);
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

	/** Erases the active layer's items; with the image layer active, erases image pixels. */
	private beginErasure(point: Point, pressure: number): DrawingGesture | null {
		const layer = this.shapes?.activeLayer;
		if (!this.shapes || !layer) return this.beginImageErasure(point, pressure);
		if (!this.shapes.isLayerEditable(layer.id)) return null;
		const itemIds = this.shapes
			.layerItems(layer.id)
			.filter(
				(item) =>
					this.shapes?.isEditable(item.id) &&
					!(item.type === AnnotationObjectTypeId.Stroke && item.points.length === 0),
			)
			.map((item) => item.id);
		if (itemIds.length === 0) return null;
		return new ObjectErasureGesture(
			this.shapes,
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
		if (tool === UtilityToolId.Picker)
			this.settings.showSampledColor(this.#imageActions.sampleColor(point));
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
