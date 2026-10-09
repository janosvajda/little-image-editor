import type { Point } from '../../../core/document/appTypes';
import type { AnnotationDocument } from '../../annotations/annotationDocument';

export const POINTER_DRAG_THRESHOLD = 3;

/** Modifier state of the pointer sample; `constrained` is held while Shift is down. */
export interface GestureModifiers {
	readonly constrained: boolean;
}

/** One pointer gesture. The implementation owns its draft and history boundary. */
export interface DrawingGesture {
	readonly coalesced?: boolean;
	readonly locksScroll?: boolean;
	update(point: Point, pressure: number, modifiers?: GestureModifiers): void;
	complete(point: Point): void;
	cancel(): void;
}

/** Common commit/cancel boundary for gestures that edit retained layer content. */
export abstract class RetainedDrawingGesture implements DrawingGesture {
	readonly #restore: () => void;

	constructor(protected readonly objects: AnnotationDocument) {
		this.#restore = objects.createCheckpoint();
	}

	abstract update(
		point: Point,
		pressure: number,
		modifiers?: GestureModifiers,
	): void;

	complete(_point: Point): void {
		this.objects.commitCurrent();
	}

	cancel(): void {
		this.#restore();
	}
}
