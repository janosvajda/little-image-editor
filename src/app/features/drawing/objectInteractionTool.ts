import {
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import { drawingToolBehavior } from './drawingToolBehavior';
import { ClickOrDragGesture } from './gestures/clickOrDragGesture';
import type { DrawingGesture } from './gestures/drawingGesture';
import {
	ObjectTransformGesture,
	ObjectTransformKind,
} from './gestures/objectTransformGesture';
import { RasterSelectionGesture } from './gestures/rasterSelectionGesture';

/**
 * Layer selection and transforms. Only the Select tool moves, resizes and
 * rotates layers: drag inside a layer to move it, drag a corner to resize it,
 * drag just outside the frame to rotate it. Other tools never transform.
 */
export class ObjectInteractionTool {
	constructor(
		private readonly objects?: AnnotationDocument,
		private readonly rasterSelection?: RasterSelection,
	) {}

	begin(
		tool: Tool,
		point: Point,
		visualScale: number,
		shapeDraft: DrawingGesture | null,
	): DrawingGesture | null {
		if (!this.objects) return null;
		if (tool === UtilityToolId.Select)
			return (
				this.selectedTransform(point, visualScale) ?? this.selectAndMove(point)
			);
		if (tool === UtilityToolId.Crop) return this.moveCutFragment(point);
		return shapeDraft ? this.selectShapeOnClick(point, shapeDraft) : null;
	}

	cursor(tool: Tool, point: Point, visualScale: number): string {
		const defaultCursor = drawingToolBehavior(tool).cursor;
		if (tool === UtilityToolId.Crop)
			return this.cutFragmentAt(point) ? 'move' : 'crosshair';
		if (tool !== UtilityToolId.Select) return defaultCursor;
		const selected = this.editableSelection();
		const selectedCursor = selected
			? genericShape(selected).cursorAt(point, visualScale)
			: null;
		if (selectedCursor) return selectedCursor;
		return this.objects?.hitTest(point) ? 'move' : defaultCursor;
	}

	/** Corner handles resize, the band outside the frame rotates, the inside moves. */
	private selectedTransform(
		point: Point,
		visualScale: number,
	): DrawingGesture | null {
		const selected = this.editableSelection();
		if (!this.objects || !selected) return null;
		const shape = genericShape(selected);
		const handle = shape.hitHandle(point, visualScale);
		if (handle)
			return new ObjectTransformGesture(this.objects, selected.id, point, {
				kind: ObjectTransformKind.Handle,
				handle,
				clickTargetId: this.objects.hitTest(point)?.id ?? null,
			});
		if (!shape.contains(point)) return null;
		const hit = this.objects.hitTest(point);
		if (!hit && selected.type === AnnotationObjectTypeId.RasterFragment)
			return null;
		return new ObjectTransformGesture(this.objects, selected.id, point, {
			kind: ObjectTransformKind.Move,
			clickTargetId: hit?.id,
		});
	}

	/** Clicking a layer selects it and lets the same drag move it. */
	private selectAndMove(point: Point): DrawingGesture | null {
		if (!this.objects) return null;
		const hit = this.objects.hitTest(point);
		if (hit && this.objects.isEditable(hit.id)) {
			this.rasterSelection?.clear();
			this.objects.select(hit.id);
			return new ObjectTransformGesture(this.objects, hit.id, point, {
				kind: ObjectTransformKind.Move,
			});
		}
		this.objects.select(null);
		return this.rasterSelection
			? new RasterSelectionGesture(this.rasterSelection, point)
			: null;
	}

	/** A cut piece stays movable with the Crop tool, so cuts can be placed at once. */
	private moveCutFragment(point: Point): DrawingGesture | null {
		const fragment = this.cutFragmentAt(point);
		return this.objects && fragment
			? new ObjectTransformGesture(this.objects, fragment.id, point, {
					kind: ObjectTransformKind.Move,
				})
			: null;
	}

	/** Shape tools select an existing shape on click and draw a new one on drag. */
	private selectShapeOnClick(
		point: Point,
		shapeDraft: DrawingGesture,
	): DrawingGesture | null {
		const hit = this.objects?.hitTest(point);
		if (
			!hit ||
			hit.type !== AnnotationObjectTypeId.Shape ||
			!this.objects?.isEditable(hit.id)
		)
			return null;
		this.rasterSelection?.clear();
		return new ClickOrDragGesture(point, shapeDraft, () =>
			this.objects?.select(hit.id),
		);
	}

	private cutFragmentAt(point: Point): AnnotationObject | null {
		const selected = this.editableSelection();
		return selected?.type === AnnotationObjectTypeId.RasterFragment &&
			genericShape(selected).contains(point)
			? selected
			: null;
	}

	private editableSelection(): AnnotationObject | null {
		const selected = this.objects?.selected ?? null;
		return selected && this.objects?.isEditable(selected.id) ? selected : null;
	}
}
