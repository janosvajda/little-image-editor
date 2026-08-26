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
import { EditorLimit } from '../../core/document/editorLimits';
import { ObjectSpatialIndex } from './objectSpatialIndex';
import { distanceToStroke } from './strokeGeometry';

const HISTORY_LIMIT = EditorLimit.EditableObjectHistory;
const ARROW_HIT_MINIMUM = 8;
const ARROW_HIT_WIDTH_FACTOR = 2;

export interface AnnotationRenderState {
	readonly revision: number;
	readonly staticRevision: number;
	readonly changedObjectId: string | null;
	readonly interactionActive: boolean;
}

export const AnnotationChangeKind = {
	Committed: 'committed',
	Transient: 'transient',
	Selection: 'selection',
} as const;
export type AnnotationChangeKind =
	(typeof AnnotationChangeKind)[keyof typeof AnnotationChangeKind];

export class AnnotationDocument {
	#state: AnnotationState = { objects: [], nextStep: 1 };
	#history: AnnotationState[] = [cloneState(this.#state)];
	#historyIndex = 0;
	#listeners = new Set<
		(state: Readonly<AnnotationState>, change: AnnotationChangeKind) => void
	>();
	#historyListeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	readonly #objectsById = new Map<string, AnnotationObject>();
	readonly #objectOrder = new Map<string, number>();
	readonly #spatialIndex = new ObjectSpatialIndex();
	#renderState: AnnotationRenderState = {
		revision: 0,
		staticRevision: 0,
		changedObjectId: null,
		interactionActive: false,
	};
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
		return this.selectedId ? (this.#objectsById.get(this.selectedId) ?? null) : null;
	}
	get renderState(): AnnotationRenderState {
		return this.#renderState;
	}
	object(id: string | null): AnnotationObject | null {
		return id ? (this.#objectsById.get(id) ?? null) : null;
	}

	onChange(
		listener: (
			state: Readonly<AnnotationState>,
			change: AnnotationChangeKind,
		) => void,
	): void {
		this.#listeners.add(listener);
		listener(this.#state, AnnotationChangeKind.Committed);
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
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.emit(AnnotationChangeKind.Committed);
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
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	add(object: AnnotationObject, commit = true): void {
		this.#state.objects.push(structuredClone(object));
		this.indexObject(this.#state.objects.at(-1)!, this.#state.objects.length - 1);
		this.markRenderedContentChanged(object.id, !commit);
		if (object.type === AnnotationObjectTypeId.Step)
			this.#state.nextStep = Math.max(this.#state.nextStep, object.value + 1);
		this.selectedId = object.id;
		if (commit) this.commit();
		else this.emit(AnnotationChangeKind.Transient);
	}

	update(
		id: string,
		updater: (object: AnnotationObject) => void,
		commit = true,
	): void {
		const object = this.#objectsById.get(id);
		if (!object) return;
		updater(object);
		this.indexObject(object, this.#objectOrder.get(id) ?? 0);
		this.markRenderedContentChanged(id, !commit);
		if (commit) this.commit();
		else this.emit(AnnotationChangeKind.Transient);
	}

	select(id: string | null): void {
		if (this.selectedId === id) return;
		this.selectedId = id;
		this.emit(AnnotationChangeKind.Selection);
	}

	removeSelected(): void {
		if (!this.selectedId) return;
		this.remove(this.selectedId);
	}

	remove(id: string): void {
		if (!this.#objectsById.has(id)) return;
		this.#state.objects = this.#state.objects.filter((object) => object.id !== id);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		if (this.selectedId === id) this.selectedId = null;
		this.commit();
	}

	setVisible(id: string, visible: boolean): void {
		this.update(id, (object) => {
			object.visible = visible;
			if (!visible && this.selectedId === id) this.selectedId = null;
		});
	}

	setLocked(id: string, locked: boolean): void {
		this.update(id, (object) => {
			object.locked = locked;
			if (locked && this.selectedId === id) this.selectedId = null;
		});
	}

	isEditable(id: string): boolean {
		const object = this.#objectsById.get(id);
		return Boolean(object && object.visible !== false && object.locked !== true);
	}

	clear(): void {
		if (this.#state.objects.length === 0) return;
		this.#state = { objects: [], nextStep: 1 };
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
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
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.selectedId = null;
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	redo(): void {
		if (!this.canRedo) return;
		this.#historyIndex += 1;
		this.#state = cloneState(this.#history[this.#historyIndex]!);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.selectedId = null;
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	hitTest(
		point: Point,
		excludedIds: ReadonlySet<string> = EMPTY_OBJECT_IDS,
	): AnnotationObject | null {
		return (
			[...this.#spatialIndex.query(point)]
				.sort(
					(left, right) =>
						(this.#objectOrder.get(right) ?? 0) -
						(this.#objectOrder.get(left) ?? 0),
				)
				.map((id) => this.#objectsById.get(id))
				.find(
					(object): object is AnnotationObject =>
						Boolean(
							object &&
							!excludedIds.has(object.id) &&
							object.visible !== false &&
							object.locked !== true &&
							containsPoint(object, point),
						),
				) ?? null
		);
	}

	discardUncommitted(ids: ReadonlySet<string>): void {
		if (ids.size === 0) return;
		this.#state.objects = this.#state.objects.filter(
			(object) => !ids.has(object.id),
		);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		if (this.selectedId && ids.has(this.selectedId)) this.selectedId = null;
		this.emit(AnnotationChangeKind.Transient);
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
		this.#renderState = {
			...this.#renderState,
			staticRevision: this.#renderState.staticRevision + 1,
			interactionActive: false,
		};
		this.commit();
	}

	private commit(): void {
		this.#history.splice(this.#historyIndex + 1);
		this.#history.push(cloneState(this.#state));
		if (this.#history.length > HISTORY_LIMIT) this.#history.shift();
		this.#historyIndex = this.#history.length - 1;
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	private emit(change: AnnotationChangeKind): void {
		this.#listeners.forEach((listener) => listener(this.#state, change));
	}
	private emitHistory(): void {
		this.#historyListeners.forEach((listener) =>
			listener(this.canUndo, this.canRedo),
		);
	}

	private rebuildObjectIndex(): void {
		this.#objectsById.clear();
		this.#objectOrder.clear();
		this.#spatialIndex.clear();
		this.#state.objects.forEach((object, index) =>
			this.indexObject(object, index),
		);
	}

	private indexObject(object: AnnotationObject, order: number): void {
		this.#objectsById.set(object.id, object);
		this.#objectOrder.set(object.id, order);
		this.#spatialIndex.set(
			object.id,
			annotationBounds(object),
			interactionPadding(object),
		);
	}

	private markRenderedContentChanged(
		changedObjectId: string | null,
		interactionActive: boolean,
	): void {
		this.#renderState = {
			revision: this.#renderState.revision + 1,
			staticRevision:
				this.#renderState.staticRevision + (interactionActive ? 0 : 1),
			changedObjectId,
			interactionActive,
		};
	}
}

export function annotationBounds(object: AnnotationObject): CropRect {
	return genericShape(object).geometry.rect;
}

export function normalizedRect(from: Point, to: Point): CropRect {
	return normalizeRectangle(from, to);
}

function containsPoint(object: AnnotationObject, point: Point): boolean {
	if (object.type === AnnotationObjectTypeId.Stroke)
		return (
			distanceToStroke(object, point) <=
			Math.max(ARROW_HIT_MINIMUM, object.size * ARROW_HIT_WIDTH_FACTOR)
		);
	if (object.type === AnnotationObjectTypeId.Arrow && !object.rotation)
		return (
			distanceToSegment(point, object.from, object.to) <=
			Math.max(ARROW_HIT_MINIMUM, object.width * ARROW_HIT_WIDTH_FACTOR)
		);
	return genericShape(object).contains(point);
}

function interactionPadding(object: AnnotationObject): number {
	if ('width' in object)
		return Math.max(ARROW_HIT_MINIMUM, object.width * ARROW_HIT_WIDTH_FACTOR);
	return ARROW_HIT_MINIMUM;
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

const EMPTY_OBJECT_IDS: ReadonlySet<string> = new Set<string>();
