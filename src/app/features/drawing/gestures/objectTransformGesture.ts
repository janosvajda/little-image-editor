import type { Point } from '../../../core/document/appTypes';
import {
	type ShapeHandle,
	ShapeHandleId,
} from '../../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../../core/geometry/genericShape';
import type { RotationDrag } from '../../../core/geometry/shapeInteraction';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import {
	type GestureModifiers,
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
			/** Layer to select when the handle is clicked without dragging; `null` is the image. */
			readonly clickTargetId?: string | null;
	  };

/** A selected-object drag, including reversible movement below the click threshold. */
export class ObjectTransformGesture extends RetainedDrawingGesture {
	readonly #rotationOrigin: RotationDrag['origin'];
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
		this.#rotationOrigin = {
			pointer: start,
			rotation: objects.object(objectId)?.rotation ?? 0,
		};
		objects.beginInteraction(objectId);
	}

	update(point: Point, _pressure?: number, modifiers?: GestureModifiers): void {
		if (!this.#dragging)
			this.#dragging =
				Math.hypot(point.x - this.start.x, point.y - this.start.y) >=
				POINTER_DRAG_THRESHOLD;
		if (this.intent.kind === ObjectTransformKind.Move) {
			this.moveTo(point);
		} else if (this.#dragging) {
			const handle = this.intent.handle;
			const rotation =
				handle === ShapeHandleId.Rotate
					? {
							origin: this.#rotationOrigin,
							constrained: modifiers?.constrained ?? false,
						}
					: undefined;
			this.objects.update(
				this.objectId,
				(object) => genericShape(object).transform(handle, point, rotation),
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
		if (this.intent.clickTargetId !== undefined)
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
