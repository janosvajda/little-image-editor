import {
	DocumentType,
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
	LinkedHistoryDomain,
} from '../annotations/annotationTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import {
	type CanvasViewportController,
	ZoomDirection,
} from '../workspace/canvasViewportController';
import { CropTool } from './cropTool';
import { DrawingImageActions } from './drawingImageActions';
import { isPaintTool, isShapeTool } from './drawingToolBehavior';
import type { DrawingToolSettings } from './drawingToolSettings';
import { BaseImagePaintGesture } from './gestures/baseImagePaintGesture';
import type { DrawingGesture } from './gestures/drawingGesture';
import { ObjectErasureGesture } from './gestures/objectErasureGesture';
import { PaintStrokeGesture } from './gestures/paintStrokeGesture';
import { ShapeDrawingGesture } from './gestures/shapeDrawingGesture';
import { ObjectInteractionTool } from './objectInteractionTool';

/** Chooses a tool action. Each returned gesture owns its own mutation and lifecycle. */
export class DrawingToolRouter {
	readonly #crop: CropTool;
	readonly #objects: ObjectInteractionTool;
	readonly #imageActions: DrawingImageActions;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly shapes: AnnotationDocument | undefined,
		private readonly viewport: CanvasViewportController | undefined,
		rasterSelection: RasterSelection | undefined,
		private readonly settings: DrawingToolSettings,
	) {
		this.#crop = new CropTool(documentModel, shapes, viewport);
		this.#objects = new ObjectInteractionTool(
			shapes,
			rasterSelection,
			documentModel,
		);
		this.#imageActions = new DrawingImageActions(documentModel, shapes);
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
		if (isPaintTool(tool) && this.shouldPaintBaseImage()) {
			this.flattenRetainedContentIntoBaseImage();
			return new BaseImagePaintGesture(
				this.documentModel,
				tool,
				this.settings.strokeOptions(),
				point,
				event.pressure,
			);
		}
		if (tool === PaintToolId.Eraser)
			return this.beginErasure(point, event.pressure);
		this.prepareFlatImageCrop(tool);
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

	private shouldPaintBaseImage(): boolean {
		return (
			this.documentModel.documentType === DocumentType.Image &&
			this.documentModel.layers.isEditable(CoreLayerId.Image)
		);
	}

	private prepareFlatImageCrop(tool: Tool): void {
		if (
			tool === UtilityToolId.Crop &&
			this.documentModel.documentType === DocumentType.Image
		)
			this.flattenRetainedContentIntoBaseImage();
	}

	private flattenRetainedContentIntoBaseImage(): void {
		if (!this.shapes || this.shapes.state.objects.length === 0) return;
		const composite = this.documentModel.compositeCanvas();
		this.documentModel.context.clearRect(
			0,
			0,
			this.documentModel.width,
			this.documentModel.height,
		);
		this.documentModel.context.drawImage(composite, 0, 0);
		this.documentModel.commit();
		this.shapes.clear(LinkedHistoryDomain.Document);
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
		const target = this.shapes.activePaintTarget;
		if (target && !this.shapes.isEditable(target.id)) return null;
		return new PaintStrokeGesture(
			this.shapes,
			this.documentModel,
			tool,
			this.settings.strokeOptions(),
			point,
			pressure,
		);
	}

	private beginErasure(point: Point, pressure: number): DrawingGesture | null {
		const selected = this.shapes?.selected;
		if (!selected || !this.shapes?.isEditable(selected.id)) return null;
		if (
			selected.type === AnnotationObjectTypeId.Stroke &&
			selected.points.length === 0
		)
			return null;
		return new ObjectErasureGesture(
			this.shapes,
			selected.id,
			point,
			pressure,
			this.settings.strokeOptions(),
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
