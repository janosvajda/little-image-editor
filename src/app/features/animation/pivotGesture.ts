import type { Point } from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import type { AnnotationObject } from '../annotations/annotationTypes';
import { RetainedDrawingGesture } from '../drawing/gestures/drawingGesture';
import { itemPivotPoint, pivotAt, setItemPivot } from './itemPivot';

/** How near, in screen pixels, a press must be to an item's pivot to drag it. */
export const PIVOT_HANDLE_RADIUS = 5;

/** Whether a press at `point` reaches the item's pivot handle at the view's scale. */
export function hitsPivot(item: AnnotationObject, point: Point, visualScale: number): boolean {
	const pivot = itemPivotPoint(item);
	return Math.hypot(point.x - pivot.x, point.y - pivot.y) <= PIVOT_HANDLE_RADIUS * visualScale;
}

/**
 * Dragging a selected item's pivot with Select: the item stays where it is
 * and only the point it turns and scales about moves, as one undo step.
 */
export class PivotGesture extends RetainedDrawingGesture {
	#moved = false;

	constructor(
		objects: AnnotationDocument,
		private readonly itemId: string,
	) {
		super(objects);
	}

	update(point: Point): void {
		this.#moved = true;
		this.objects.update(
			this.itemId,
			(item) => setItemPivot(item, pivotAt(genericShape(item).geometry, point)),
			false,
		);
	}

	/** A press that never moved the pivot is not an edit. */
	override complete(point: Point): void {
		if (this.#moved) super.complete(point);
		else this.cancel();
	}
}
