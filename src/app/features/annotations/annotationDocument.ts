import type { CropRect, Point } from '../../core/document/appTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type AnnotationSessionState,
	type AnnotationState,
} from './annotationTypes';
import {
	ShapeHandleId,
	type ShapeHandle,
} from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import { normalizedRect as normalizeRectangle } from '../../core/geometry/geometryHelpers';

const HISTORY_LIMIT = 50;
const ARROW_HIT_MINIMUM = 8;
const ARROW_HIT_WIDTH_FACTOR = 2;

export class AnnotationDocument {
	#state: AnnotationState = { objects: [], nextStep: 1 };
	#history: AnnotationState[] = [cloneState(this.#state)];
	#historyIndex = 0;
	#listeners = new Set<(state: Readonly<AnnotationState>) => void>();
	#historyListeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	selectedId: string | null = null;

	get state(): Readonly<AnnotationState> {
		return this.#state;
	}
	get canUndo(): boolean {
		return this.#historyIndex > 0;
	}
	get canRedo(): boolean {
		return this.#historyIndex < this.#history.length - 1;
	}
	get selected(): AnnotationObject | null {
		return (
			this.#state.objects.find((object) => object.id === this.selectedId) ??
			null
		);
	}

	onChange(listener: (state: Readonly<AnnotationState>) => void): void {
		this.#listeners.add(listener);
		listener(this.#state);
	}
	onHistoryChange(
		listener: (canUndo: boolean, canRedo: boolean) => void,
	): void {
		this.#historyListeners.add(listener);
		listener(this.canUndo, this.canRedo);
	}

	snapshotSession(): AnnotationSessionState {
		return {
			state: cloneState(this.#state),
			history: this.#history.map(cloneState),
			historyIndex: this.#historyIndex,
		};
	}

	restore(state?: AnnotationState): void {
		this.#state = state ? cloneState(state) : { objects: [], nextStep: 1 };
		this.#history = [cloneState(this.#state)];
		this.#historyIndex = 0;
		this.selectedId = null;
		this.emit();
		this.emitHistory();
	}

	restoreSession(session: AnnotationSessionState): void {
		this.#history =
			session.history.length > 0
				? session.history.map(cloneState)
				: [cloneState(session.state)];
		this.#historyIndex = Math.max(
			0,
			Math.min(session.historyIndex, this.#history.length - 1),
		);
		this.#state = cloneState(session.state);
		this.#history[this.#historyIndex] = cloneState(this.#state);
		this.selectedId = null;
		this.emit();
		this.emitHistory();
	}

	add(object: AnnotationObject): void {
		this.#state.objects.push(structuredClone(object));
		if (object.type === AnnotationObjectTypeId.Step)
			this.#state.nextStep = Math.max(this.#state.nextStep, object.value + 1);
		this.selectedId = object.id;
		this.commit();
	}

	update(
		id: string,
		updater: (object: AnnotationObject) => void,
		commit = true,
	): void {
		const object = this.#state.objects.find((candidate) => candidate.id === id);
		if (!object) return;
		updater(object);
		if (commit) this.commit();
		else this.emit();
	}

	select(id: string | null): void {
		if (this.selectedId === id) return;
		this.selectedId = id;
		this.emit();
	}

	removeSelected(): void {
		if (!this.selectedId) return;
		this.#state.objects = this.#state.objects.filter(
			(object) => object.id !== this.selectedId,
		);
		this.selectedId = null;
		this.commit();
	}

	clear(): void {
		if (this.#state.objects.length === 0) return;
		this.#state = { objects: [], nextStep: 1 };
		this.selectedId = null;
		this.commit();
	}

	restartSteps(value = 1): void {
		this.#state.nextStep = Math.max(0, Math.round(value));
		this.commit();
	}

	undo(): void {
		if (!this.canUndo) return;
		this.#historyIndex -= 1;
		this.#state = cloneState(this.#history[this.#historyIndex]!);
		this.selectedId = null;
		this.emit();
		this.emitHistory();
	}

	redo(): void {
		if (!this.canRedo) return;
		this.#historyIndex += 1;
		this.#state = cloneState(this.#history[this.#historyIndex]!);
		this.selectedId = null;
		this.emit();
		this.emitHistory();
	}

	hitTest(point: Point): AnnotationObject | null {
		return (
			[...this.#state.objects]
				.reverse()
				.find((object) => containsPoint(object, point)) ?? null
		);
	}

	move(id: string, delta: Point, commit = true): void {
		this.update(id, (object) => genericShape(object).move(delta), commit);
	}

	resizeSelected(to: Point, commit = true): void {
		const selected = this.selected;
		if (!selected) return;
		this.update(
			selected.id,
			(object) => genericShape(object).transform(ShapeHandleId.SouthEast, to),
			commit,
		);
	}

	transformSelected(handle: ShapeHandle, to: Point, commit = true): void {
		const selected = this.selected;
		if (!selected) return;
		this.update(
			selected.id,
			(object) => genericShape(object).transform(handle, to),
			commit,
		);
	}

	commitCurrent(): void {
		this.commit();
	}

	private commit(): void {
		this.#history.splice(this.#historyIndex + 1);
		this.#history.push(cloneState(this.#state));
		if (this.#history.length > HISTORY_LIMIT) this.#history.shift();
		this.#historyIndex = this.#history.length - 1;
		this.emit();
		this.emitHistory();
	}

	private emit(): void {
		this.#listeners.forEach((listener) => listener(this.#state));
	}
	private emitHistory(): void {
		this.#historyListeners.forEach((listener) =>
			listener(this.canUndo, this.canRedo),
		);
	}
}

export function annotationBounds(object: AnnotationObject): CropRect {
	return genericShape(object).geometry.rect;
}

export function normalizedRect(from: Point, to: Point): CropRect {
	return normalizeRectangle(from, to);
}

function containsPoint(object: AnnotationObject, point: Point): boolean {
	if (object.type === AnnotationObjectTypeId.Arrow && !object.rotation)
		return (
			distanceToSegment(point, object.from, object.to) <=
			Math.max(ARROW_HIT_MINIMUM, object.width * ARROW_HIT_WIDTH_FACTOR)
		);
	return genericShape(object).contains(point);
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
	const dx = to.x - from.x,
		dy = to.y - from.y;
	if (dx === 0 && dy === 0)
		return Math.hypot(point.x - from.x, point.y - from.y);
	const t = Math.max(
		0,
		Math.min(
			1,
			((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy),
		),
	);
	return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

function cloneState(state: AnnotationState): AnnotationState {
	return structuredClone(state);
}
