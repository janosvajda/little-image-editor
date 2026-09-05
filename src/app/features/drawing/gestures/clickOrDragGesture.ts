import type { Point } from '../../../core/document/appTypes';
import { POINTER_DRAG_THRESHOLD, type DrawingGesture } from './drawingGesture';

/** Defers an action until dragging is intentional, leaving a click for selection. */
export class ClickOrDragGesture implements DrawingGesture {
	#dragging = false;

	constructor(
		private readonly start: Point,
		private readonly drag: DrawingGesture,
		private readonly click: () => void,
	) {}

	update(point: Point, pressure: number): void {
		if (!this.#dragging)
			this.#dragging =
				Math.hypot(point.x - this.start.x, point.y - this.start.y) >=
				POINTER_DRAG_THRESHOLD;
		if (this.#dragging) this.drag.update(point, pressure);
	}

	complete(point: Point): void {
		if (this.#dragging) this.drag.complete(point);
		else this.click();
	}

	cancel(): void {
		if (this.#dragging) this.drag.cancel();
	}
}
