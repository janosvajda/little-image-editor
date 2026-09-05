import type { Point } from '../../core/document/appTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';

const SelectionClick = {
	MaximumIntervalMs: 1_000,
	MaximumDistancePixels: 4,
	ClicksPerDoubleClick: 2,
} as const;

interface SelectionClickSequence {
	readonly restore: () => void;
	readonly targetId: string;
	readonly screenPoint: Point;
	readonly timestamp: number;
	readonly count: number;
	revision: number;
}

/** Lets native double-click selection roll back its preceding paint clicks. */
export class CanvasSelectionGesture {
	#sequence: SelectionClickSequence | null = null;
	#pending: SelectionClickSequence | null = null;

	constructor(private readonly objects: AnnotationDocument) {}

	begin(point: Point, event: PointerEvent): void {
		this.#pending = null;
		if (event.pointerType && event.pointerType !== 'mouse') {
			this.clear();
			return;
		}
		const previous = this.#sequence;
		if (
			previous &&
			previous.count < SelectionClick.ClicksPerDoubleClick &&
			this.matches(previous, event)
		) {
			this.#pending = { ...previous, count: previous.count + 1 };
			return;
		}
		this.clear();
		const hit = this.objects.hitTest(point);
		if (!hit) return;
		this.#pending = {
			restore: this.objects.createCheckpoint(),
			targetId: hit.id,
			screenPoint: { x: event.clientX, y: event.clientY },
			timestamp: event.timeStamp,
			count: 1,
			revision: this.objects.renderState.revision,
		};
	}

	move(event: PointerEvent): void {
		if (this.#pending && !this.near(this.#pending, event)) this.clear();
	}

	finish(event: PointerEvent): void {
		this.move(event);
		this.#sequence = this.#pending;
		if (this.#sequence)
			this.#sequence.revision = this.objects.renderState.revision;
		this.#pending = null;
	}

	selectionTarget(point: Point, event: MouseEvent): string | null {
		const sequence = this.#sequence;
		this.clear();
		if (sequence && this.matches(sequence, event)) {
			sequence.restore();
			return sequence.targetId;
		}
		return this.objects.hitTest(point)?.id ?? null;
	}

	clear(): void {
		this.#sequence = null;
		this.#pending = null;
	}

	private matches(
		sequence: SelectionClickSequence,
		event: MouseEvent,
	): boolean {
		return (
			sequence.revision === this.objects.renderState.revision &&
			event.timeStamp - sequence.timestamp <=
				SelectionClick.MaximumIntervalMs &&
			this.near(sequence, event)
		);
	}

	private near(sequence: SelectionClickSequence, event: MouseEvent): boolean {
		return (
			Math.hypot(
				event.clientX - sequence.screenPoint.x,
				event.clientY - sequence.screenPoint.y,
			) <= SelectionClick.MaximumDistancePixels
		);
	}
}
