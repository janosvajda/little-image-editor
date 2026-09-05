import {
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import type { SelectionBounds } from '../../core/geometry/shapeTransformHelpers';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import {
	DrawingToolKind,
	drawingToolBehavior,
	isToolKind,
} from './drawingToolBehavior';
import { ClickOrDragGesture } from './gestures/clickOrDragGesture';
import type { DrawingGesture } from './gestures/drawingGesture';
import {
	ObjectTransformGesture,
	ObjectTransformKind,
} from './gestures/objectTransformGesture';
import { RasterSelectionGesture } from './gestures/rasterSelectionGesture';

/** Resolves hit testing and cursor affordances using the shared shape/layer model. */
export class ObjectInteractionTool {
	constructor(
		private readonly objects?: AnnotationDocument,
		private readonly rasterSelection?: RasterSelection,
		private readonly bounds?: SelectionBounds,
	) {}

	begin(
		tool: Tool,
		point: Point,
		visualScale: number,
		shapeDraft: DrawingGesture | null,
	): DrawingGesture | null {
		if (!this.objects) return null;
		const selected = this.objects.selected;
		const existing = this.selectedInteraction(tool, point, visualScale);
		if (existing) return existing;
		if (
			tool === UtilityToolId.Crop ||
			(!shapeDraft && tool !== UtilityToolId.Select)
		)
			return null;
		const hit = this.objects.hitTest(point);
		const selectable =
			hit &&
			this.objects.isEditable(hit.id) &&
			(tool === UtilityToolId.Select ||
				hit.type === AnnotationObjectTypeId.Shape)
				? hit
				: null;
		if (selectable) {
			this.rasterSelection?.clear();
			if (selectable.id !== selected?.id && shapeDraft) {
				return new ClickOrDragGesture(point, shapeDraft, () =>
					this.objects?.select(selectable.id),
				);
			}
			this.objects.select(selectable.id);
			return new ObjectTransformGesture(this.objects, selectable.id, point, {
				kind: ObjectTransformKind.Move,
			});
		}
		if (tool !== UtilityToolId.Select) return null;
		this.objects.select(null);
		return this.rasterSelection
			? new RasterSelectionGesture(this.rasterSelection, point)
			: null;
	}

	cursor(tool: Tool, point: Point, visualScale: number): string {
		const defaultCursor = drawingToolBehavior(tool).cursor;
		const selected = this.objects?.selected;
		const transformCursor = this.transformCursor(tool, point, visualScale);
		if (transformCursor) return transformCursor;
		if (tool === UtilityToolId.Crop)
			return selected?.type === AnnotationObjectTypeId.RasterFragment &&
				genericShape(selected).contains(point)
				? 'move'
				: 'crosshair';
		if (
			!isToolKind(tool, DrawingToolKind.Shape) &&
			tool !== UtilityToolId.Select
		)
			return defaultCursor;
		const selectable =
			selected &&
			(tool === UtilityToolId.Select ||
				selected.type === AnnotationObjectTypeId.Shape)
				? selected
				: null;
		const selectedCursor = selectable
			? genericShape(selectable).cursorAt(point, visualScale)
			: null;
		if (selectedCursor) return selectedCursor;
		return tool === UtilityToolId.Select && this.objects?.hitTest(point)
			? 'move'
			: defaultCursor;
	}

	private selectedInteraction(
		tool: Tool,
		point: Point,
		scale: number,
	): DrawingGesture | null {
		const selected = this.objects?.selected;
		if (
			!selected ||
			!this.objects?.isEditable(selected.id) ||
			this.isPaintingRaster(tool, selected, point, scale)
		)
			return null;
		const shape = genericShape(selected);
		if (shape.hitMoveHandle(point, scale, this.bounds))
			return new ObjectTransformGesture(this.objects, selected.id, point, {
				kind: ObjectTransformKind.Move,
			});
		const handle = shape.hitHandle(point, scale);
		if (handle)
			return new ObjectTransformGesture(this.objects, selected.id, point, {
				kind: ObjectTransformKind.Handle,
				handle,
			});
		if (
			tool === UtilityToolId.Crop &&
			selected.type === AnnotationObjectTypeId.RasterFragment &&
			shape.contains(point)
		)
			return new ObjectTransformGesture(this.objects, selected.id, point, {
				kind: ObjectTransformKind.Move,
			});
		if (tool !== UtilityToolId.Select || !shape.contains(point)) return null;
		const hit = this.objects.hitTest(point);
		if (!hit && selected.type === AnnotationObjectTypeId.RasterFragment)
			return null;
		return new ObjectTransformGesture(this.objects, selected.id, point, {
			kind: ObjectTransformKind.Move,
			clickTargetId: hit?.id,
		});
	}

	private transformCursor(
		tool: Tool,
		point: Point,
		scale: number,
	): string | null {
		const selected = this.objects?.selected;
		if (
			!selected ||
			!this.objects?.isEditable(selected.id) ||
			this.isPaintingRaster(tool, selected, point, scale)
		)
			return null;
		const shape = genericShape(selected);
		return (
			(shape.hitMoveHandle(point, scale, this.bounds) ? 'move' : null) ??
			shape.handleCursorAt(point, scale)
		);
	}

	private isPaintingRaster(
		tool: Tool,
		selected: AnnotationObject,
		point: Point,
		scale: number,
	): boolean {
		return (
			isToolKind(tool, DrawingToolKind.Paint) &&
			selected.type === AnnotationObjectTypeId.RasterFragment &&
			genericShape(selected).contains(point) &&
			!genericShape(selected).hitMoveHandle(point, scale, this.bounds)
		);
	}
}
