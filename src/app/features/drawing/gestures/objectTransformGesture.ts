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

/**
 * A selected-item drag. A move follows the pointer at once and is undone if
 * the gesture stays a click; handles act only past the drag threshold. The
 * item renders as interactive only once it actually changes, so a plain click
 * leaves every pixel as it was.
 */
export class ObjectTransformGesture extends RetainedDrawingGesture {
	readonly #rotationOrigin: RotationDrag['origin'];
	#last: Point;
	#dragging = false;
	#interacting = false;

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
	}

	update(point: Point, _pressure?: number, modifiers?: GestureModifiers): void {
		this.#dragging ||=
			Math.hypot(point.x - this.start.x, point.y - this.start.y) >=
			POINTER_DRAG_THRESHOLD;
		if (this.intent.kind === ObjectTransformKind.Move) {
			if (point.x === this.#last.x && point.y === this.#last.y) return;
			this.beginInteraction();
			this.moveTo(point);
		} else if (this.#dragging) {
			this.beginInteraction();
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
		if (this.#interacting) {
			this.moveTo(this.start);
			this.objects.cancelCurrentInteraction();
		}
		const target = this.intent.clickTargetId;
		if (target === null) this.objects.activate(null);
		else if (target !== undefined) this.objects.select(target);
	}

	private beginInteraction(): void {
		if (this.#interacting) return;
		this.#interacting = true;
		this.objects.beginInteraction(this.objectId);
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
