import type { Point } from '../../../core/document/appTypes';
import type { ShapeHandle } from '../../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../../core/geometry/genericShape';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import {
	POINTER_DRAG_THRESHOLD,
	RetainedDrawingGesture,
} from './drawingGesture';

export const ObjectTransformKind = { Move: 'move', Handle: 'handle' } as const;
export type ObjectTransformIntent =
	| {
			readonly kind: typeof ObjectTransformKind.Move;
			readonly clickTargetId?: string;
	  }
	| {
			readonly kind: typeof ObjectTransformKind.Handle;
			readonly handle: ShapeHandle;
	  };

/** A selected-object drag, including reversible movement below the click threshold. */
export class ObjectTransformGesture extends RetainedDrawingGesture {
	#last: Point;
	#dragging = false;

	constructor(
		objects: AnnotationDocument,
		private readonly objectId: string,
		private readonly start: Point,
		private readonly intent: ObjectTransformIntent,
	) {
		super(objects);
		this.#last = start;
		objects.beginInteraction(objectId);
	}

	update(point: Point): void {
		if (!this.#dragging)
			this.#dragging =
				Math.hypot(point.x - this.start.x, point.y - this.start.y) >=
				POINTER_DRAG_THRESHOLD;
		if (this.intent.kind === ObjectTransformKind.Move) {
			this.moveTo(point);
		} else if (this.#dragging) {
			const handle = this.intent.handle;
			this.objects.update(
				this.objectId,
				(object) => genericShape(object).transform(handle, point),
				false,
			);
		}
	}

	override complete(point: Point): void {
		if (this.#dragging) {
			super.complete(point);
			return;
		}
		if (this.intent.kind === ObjectTransformKind.Move) this.moveTo(this.start);
		this.objects.cancelCurrentInteraction();
		if (
			this.intent.kind === ObjectTransformKind.Move &&
			this.intent.clickTargetId
		)
			this.objects.select(this.intent.clickTargetId);
	}

	private moveTo(point: Point): void {
		this.objects.move(
			this.objectId,
			{ x: point.x - this.#last.x, y: point.y - this.#last.y },
			false,
		);
		this.#last = point;
	}
}
