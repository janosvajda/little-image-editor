import type { CropRect, Point } from '../../core/document/appTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type AnnotationSessionState,
	type AnnotationState,
	type LinkedHistoryDomain,
	type RasterFragmentAnnotation,
} from './annotationTypes';
import {
	ShapeHandleId,
	type ShapeHandle,
} from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import type { RotationDrag } from '../../core/geometry/shapeInteraction';
import { normalizedRect as normalizeRectangle } from '../../core/geometry/geometryHelpers';
import { EditorLimit } from '../../core/document/editorLimits';
import { ObjectSpatialIndex } from './objectSpatialIndex';
import { strokeContainsPoint } from './strokeGeometry';
import { createPaintLayer } from './paintLayerFactory';
import { RasterFragmentSurface } from './rasterFragmentSurface';
import { createObjectPixelMask } from './objectErasures';
import type {
	HistoryCommit,
	HistoryParticipant,
} from '../../core/history/editorHistory';
import {
	isLayerOpacity,
	type LayerAppearanceChange,
} from '../../core/layers/layerTypes';
import {
	applyLayerAppearance,
	duplicateLayerName,
	layerAppearance,
	LayerNumbering,
	resolveLayerNames,
} from '../layers/layerAppearance';

const HISTORY_LIMIT = EditorLimit.EditableObjectHistory;
const ARROW_HIT_MINIMUM = 8;
const ARROW_HIT_WIDTH_FACTOR = 2;
const MINIMUM_POLYGON_POINTS = 3;

export interface AnnotationRenderState {
	readonly revision: number;
	readonly staticRevision: number;
	readonly changedObjectId: string | null;
	readonly interactionActive: boolean;
}

export const AnnotationChangeKind = {
	Committed: 'committed',
	Transient: 'transient',
	Interaction: 'interaction',
	Selection: 'selection',
} as const;
export type AnnotationChangeKind =
	(typeof AnnotationChangeKind)[keyof typeof AnnotationChangeKind];

export const AnnotationStackDirection = {
	Forward: 'forward',
	Backward: 'backward',
} as const;
export type AnnotationStackDirection =
	(typeof AnnotationStackDirection)[keyof typeof AnnotationStackDirection];

export const LinkedHistoryDirection = {
	Undo: 'undo',
	Redo: 'redo',
} as const;
export type LinkedHistoryDirection =
	(typeof LinkedHistoryDirection)[keyof typeof LinkedHistoryDirection];

export class AnnotationDocument implements HistoryParticipant {
	#state: AnnotationState = { objects: [], nextStep: 1 };
	#history: AnnotationState[] = [cloneState(this.#state)];
	#historyLinks: Array<LinkedHistoryDomain | null> = [null];
	#historyIndex = 0;
	#listeners = new Set<
		(state: Readonly<AnnotationState>, change: AnnotationChangeKind) => void
	>();
	#historyListeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	#commitListeners = new Set<(commit: HistoryCommit) => void>();
	#linkedHistoryListeners = new Set<
		(domain: LinkedHistoryDomain, direction: LinkedHistoryDirection) => void
	>();
	readonly #objectsById = new Map<string, AnnotationObject>();
	readonly #rasterHitSurfaces = new Map<string, RasterFragmentSurface>();
	readonly #objectOrder = new Map<string, number>();
	readonly #spatialIndex = new ObjectSpatialIndex();
	#renderState: AnnotationRenderState = {
		revision: 0,
		staticRevision: 0,
		changedObjectId: null,
		interactionActive: false,
	};
	selectedId: string | null = null;
	#activeLayerId: string | null = null;

	get state(): Readonly<AnnotationState> {
		return this.#state;
	}
	get canUndo(): boolean {
		return this.#historyIndex > 0;
	}
	get canRedo(): boolean {
		return this.#historyIndex < this.#history.length - 1;
	}
	get undoDepth(): number {
		return this.#historyIndex;
	}
	onCommit(listener: (commit: HistoryCommit) => void): void {
		this.#commitListeners.add(listener);
	}
	get selected(): AnnotationObject | null {
		return this.selectedId ? (this.#objectsById.get(this.selectedId) ?? null) : null;
	}
	/** Restores an input gesture, including its history, when it becomes a selection. */
	createCheckpoint(): () => void {
		const state = cloneState(this.#state);
		const history = [...this.#history];
		const historyLinks = [...this.#historyLinks];
		const historyIndex = this.#historyIndex;
		const selectedId = this.selectedId;
		const activeLayerId = this.#activeLayerId;
		return () => {
			this.#state = cloneState(state);
			this.#history = [...history];
			this.#historyLinks = [...historyLinks];
			this.#historyIndex = historyIndex;
			this.selectedId = selectedId;
			this.#activeLayerId = activeLayerId;
			this.rebuildObjectIndex();
			this.markRenderedContentChanged(null, false);
			this.emit(AnnotationChangeKind.Committed);
			this.emitHistory();
		};
	}

	/**
	 * The layer that receives paint and above which new layers are created.
	 * `null` means the image layer. It survives tool changes and deselection
	 * of transform handles.
	 */
	get activeLayer(): AnnotationObject | null {
		return this.object(this.#activeLayerId);
	}

	get activePaintLayer(): Extract<AnnotationObject, { type: typeof AnnotationObjectTypeId.Stroke }> | null {
		const target = this.activeLayer;
		return target?.type === AnnotationObjectTypeId.Stroke ? target : null;
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
	onLinkedHistoryAction(
		listener: (
			domain: LinkedHistoryDomain,
			direction: LinkedHistoryDirection,
		) => void,
	): void {
		this.#linkedHistoryListeners.add(listener);
	}

	snapshotSession(): AnnotationSessionState {
		const historyLinks = this.#historyLinks.some(Boolean)
			? [...this.#historyLinks]
			: undefined;
		return {
			state: cloneState(this.#state),
			history: this.#history.map(cloneState),
			historyIndex: this.#historyIndex,
			...(historyLinks ? { historyLinks } : {}),
		};
	}

	restore(state?: AnnotationState): void {
		this.#state = state ? cloneState(state) : { objects: [], nextStep: 1 };
		this.#history = [cloneState(this.#state)];
		this.#historyLinks = [null];
		this.#historyIndex = 0;
		this.selectedId = null;
		this.#activeLayerId = this.#state.objects.at(-1)?.id ?? null;
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
		this.#historyLinks = normalizeHistoryLinks(
			session.historyLinks,
			this.#history.length,
		);
		this.selectedId = null;
		this.#activeLayerId = this.#state.objects.at(-1)?.id ?? null;
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	add(
		object: AnnotationObject,
		commit = true,
		historyLink: LinkedHistoryDomain | null = null,
	): void {
		this.insertLayer(structuredClone(object), this.insertionIndex());
		this.markRenderedContentChanged(object.id, !commit);
		if (object.type === AnnotationObjectTypeId.Step)
			this.#state.nextStep = Math.max(this.#state.nextStep, object.value + 1);
		this.selectedId = object.id;
		this.#activeLayerId = object.id;
		if (commit) this.commit(historyLink);
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

	/** Selects a layer for editing and makes it active; `null` activates the image. */
	select(id: string | null): void {
		const activeLayerId = this.object(id) ? id : null;
		if (this.selectedId === id && this.#activeLayerId === activeLayerId) return;
		this.selectedId = id;
		this.#activeLayerId = activeLayerId;
		this.emit(AnnotationChangeKind.Selection);
	}

	/** The layer's stored name, or its stable generated name for older data. */
	layerName(id: string): string {
		return resolveLayerNames(this.#state.objects).get(id) ?? '';
	}

	/** Makes a layer active without showing its transform handles; `null` is the image. */
	activate(id: string | null): void {
		const activeLayerId = this.object(id) ? id : null;
		const clearsSelection =
			this.selectedId !== null && this.selectedId !== activeLayerId;
		if (this.#activeLayerId === activeLayerId && !clearsSelection) return;
		this.#activeLayerId = activeLayerId;
		if (clearsSelection) this.selectedId = null;
		this.emit(AnnotationChangeKind.Selection);
	}

	/** Hides transform handles; the active layer stays, as when switching tools. */
	clearSelection(): void {
		if (this.selectedId === null) return;
		this.selectedId = null;
		this.emit(AnnotationChangeKind.Selection);
	}

	setLayerAppearance(
		id: string,
		change: LayerAppearanceChange,
		commit = true,
	): void {
		const object = this.#objectsById.get(id);
		const name = change.name?.trim();
		if (
			!object ||
			name === '' ||
			(change.opacity !== undefined && !isLayerOpacity(change.opacity))
		)
			return;
		const current = {
			...layerAppearance(object),
			name: this.layerName(id),
		};
		const next = { ...current, ...change, ...(name ? { name } : {}) };
		if (
			next.name === current.name &&
			next.opacity === current.opacity &&
			next.blendMode === current.blendMode
		)
			return;
		this.update(id, (layer) => applyLayerAppearance(layer, next), commit);
	}

	/** Copies a layer directly above itself and makes the copy active. */
	duplicate(id: string): string | null {
		const source = this.#objectsById.get(id);
		const sourceIndex = this.#objectOrder.get(id);
		if (!source || sourceIndex === undefined) return null;
		const copy = structuredClone(source);
		copy.id = crypto.randomUUID();
		copy.name = duplicateLayerName(this.layerName(id));
		this.insertLayer(copy, sourceIndex + 1);
		this.selectedId = copy.id;
		this.#activeLayerId = copy.id;
		this.markRenderedContentChanged(null, false);
		this.commit();
		return copy.id;
	}

	/** Adds an empty paint layer directly above the active layer. */
	createPaintLayer(): string {
		const layer = createPaintLayer();
		this.add(layer);
		return layer.id;
	}

	beginInteraction(id: string): void {
		if (!this.#objectsById.has(id)) return;
		this.markRenderedContentChanged(id, true);
		this.emit(AnnotationChangeKind.Interaction);
	}

	cancelCurrentInteraction(): void {
		if (!this.#renderState.interactionActive) return;
		this.#renderState = {
			...this.#renderState,
			revision: this.#renderState.revision + 1,
			staticRevision: this.#renderState.staticRevision + 1,
			interactionActive: false,
		};
		this.emit(AnnotationChangeKind.Interaction);
	}

	removeSelected(): void {
		if (!this.selectedId) return;
		this.remove(this.selectedId);
	}

	/** Deletes a layer; an active layer passes activation to the layer beneath it. */
	remove(id: string, historyLink: LinkedHistoryDomain | null = null): void {
		const index = this.#objectOrder.get(id);
		if (index === undefined) return;
		this.#state.objects = this.#state.objects.filter((object) => object.id !== id);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		if (this.selectedId === id) this.selectedId = null;
		if (this.#activeLayerId === id)
			this.#activeLayerId =
				this.#state.objects[index - 1]?.id ??
				this.#state.objects[index]?.id ??
				null;
		this.commit(historyLink);
	}

	/** Replaces adjacent layers with one layer in their lowest position, as one step. */
	replaceLayers(ids: readonly string[], replacement: AnnotationObject): void {
		const indices = ids.flatMap((id) => {
			const index = this.#objectOrder.get(id);
			return index === undefined ? [] : [index];
		});
		if (indices.length !== ids.length || indices.length === 0) return;
		const removed = new Set(ids);
		const index = Math.min(...indices);
		this.#state.objects = this.#state.objects.filter(
			(object) => !removed.has(object.id),
		);
		this.#state.objects.splice(index, 0, structuredClone(replacement));
		this.rebuildObjectIndex();
		this.selectedId = replacement.id;
		this.#activeLayerId = replacement.id;
		this.markRenderedContentChanged(null, false);
		this.commit();
	}

	reorder(id: string, direction: AnnotationStackDirection): void {
		const currentIndex = this.#objectOrder.get(id);
		if (currentIndex === undefined) return;
		const offset = direction === AnnotationStackDirection.Forward ? 1 : -1;
		const targetIndex = currentIndex + offset;
		if (targetIndex < 0 || targetIndex >= this.#state.objects.length) return;
		const current = this.#state.objects[currentIndex];
		const target = this.#state.objects[targetIndex];
		if (!current || !target) return;
		this.#state.objects[currentIndex] = target;
		this.#state.objects[targetIndex] = current;
		this.indexObject(target, currentIndex);
		this.indexObject(current, targetIndex);
		this.markRenderedContentChanged(null, false);
		this.commit();
	}

	moveToObject(id: string, targetId: string): void {
		const currentIndex = this.#objectOrder.get(id);
		const targetIndex = this.#objectOrder.get(targetId);
		if (
			currentIndex === undefined ||
			targetIndex === undefined ||
			currentIndex === targetIndex
		)
			return;
		const [object] = this.#state.objects.splice(currentIndex, 1);
		if (!object) return;
		this.#state.objects.splice(targetIndex, 0, object);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
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

	clear(historyLink: LinkedHistoryDomain | null = null): void {
		if (this.#state.objects.length === 0) return;
		this.#state = { objects: [], nextStep: 1 };
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.selectedId = null;
		this.#activeLayerId = null;
		this.commit(historyLink);
	}

	restartSteps(value = 1): void {
		this.#state.nextStep = Math.max(0, Math.round(value));
		this.commit();
	}

	undo(): void {
		if (!this.canUndo) return;
		this.emitLinkedHistory(
			this.#historyLinks[this.#historyIndex],
			LinkedHistoryDirection.Undo,
		);
		this.#historyIndex -= 1;
		this.#state = cloneState(this.#history[this.#historyIndex]!);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.selectedId = null;
		this.keepExistingActiveLayer();
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	redo(): void {
		if (!this.canRedo) return;
		this.emitLinkedHistory(
			this.#historyLinks[this.#historyIndex + 1],
			LinkedHistoryDirection.Redo,
		);
		this.#historyIndex += 1;
		this.#state = cloneState(this.#history[this.#historyIndex]!);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.selectedId = null;
		this.keepExistingActiveLayer();
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	hitTest(
		point: Point,
		excludedIds: ReadonlySet<string> = EMPTY_OBJECT_IDS,
	): AnnotationObject | null {
		let topmost: AnnotationObject | null = null;
		let topmostOrder = -1;
		for (const id of this.#spatialIndex.query(point)) {
			const object = this.#objectsById.get(id);
			const order = this.#objectOrder.get(id) ?? 0;
			if (
				order <= topmostOrder ||
				!object ||
				excludedIds.has(id) ||
				object.visible === false ||
				object.locked === true ||
				!this.containsPoint(object, point)
			)
				continue;
			topmost = object;
			topmostOrder = order;
		}
		return topmost;
	}

	containsObjectPoint(id: string, point: Point): boolean {
		const object = this.object(id);
		return object !== null && this.isEditable(id) && this.containsPoint(object, point);
	}

	discardUncommitted(ids: ReadonlySet<string>): void {
		if (ids.size === 0) return;
		this.#state.objects = this.#state.objects.filter(
			(object) => !ids.has(object.id),
		);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		const selectionChanged = Boolean(
			this.selectedId && ids.has(this.selectedId),
		);
		if (selectionChanged) this.selectedId = null;
		this.emit(AnnotationChangeKind.Transient);
		if (selectionChanged) this.emit(AnnotationChangeKind.Selection);
	}

	move(id: string, delta: Point, commit = true): void {
		this.update(id, (object) => genericShape(object).move(delta), commit);
	}

	/** Re-bases retained content after a document crop without flattening it. */
	translateAll(delta: Point, recordHistory = true): void {
		if (this.#state.objects.length === 0) return;
		for (const object of this.#state.objects) genericShape(object).move(delta);
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		if (recordHistory) this.commit();
		else this.emit(AnnotationChangeKind.Committed);
	}

	cutAndMove(id: string, selection: readonly Point[], delta: Point): string | null {
		const source = this.#objectsById.get(id);
		const sourceIndex = this.#objectOrder.get(id);
		if (
			!source ||
			sourceIndex === undefined ||
			selection.length < MINIMUM_POLYGON_POINTS
		)
			return null;
		const fragment = structuredClone(source);
		const mask = createObjectPixelMask(genericShape(source).geometry, selection);
		source.pixelCutouts ??= [];
		source.pixelCutouts.push(mask);
		fragment.id = crypto.randomUUID();
		fragment.name = this.nextLayerName(fragment.type);
		fragment.pixelClips ??= [];
		fragment.pixelClips.push(mask);
		genericShape(fragment).move(delta);
		this.#state.objects.splice(sourceIndex + 1, 0, fragment);
		this.selectedId = fragment.id;
		this.#activeLayerId = fragment.id;
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.commit();
		return fragment.id;
	}

	cutToRasterFragment(
		id: string,
		selection: readonly Point[],
		fragment: RasterFragmentAnnotation,
	): string | null {
		const source = this.#objectsById.get(id);
		const sourceIndex = this.#objectOrder.get(id);
		if (
			!source ||
			sourceIndex === undefined ||
			selection.length < MINIMUM_POLYGON_POINTS
		)
			return null;
		source.pixelCutouts ??= [];
		const mask = createObjectPixelMask(
			genericShape(source).geometry,
			selection,
		);
		if (source.type === AnnotationObjectTypeId.Stroke) {
			mask.strokePointLimit = source.points.length;
			mask.strokeSourceRect = { ...(source.sourceRect ?? source.rect) };
		}
		source.pixelCutouts.push(mask);
		fragment.name ??= this.nextLayerName(fragment.type);
		this.#state.objects.splice(sourceIndex + 1, 0, fragment);
		this.selectedId = fragment.id;
		this.#activeLayerId = fragment.id;
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.commit();
		return fragment.id;
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

	transformSelected(
		handle: ShapeHandle,
		to: Point,
		commit = true,
		rotation?: RotationDrag,
	): void {
		const selected = this.selected;
		if (!selected) return;
		this.update(
			selected.id,
			(object) => genericShape(object).transform(handle, to, rotation),
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

	private commit(historyLink: LinkedHistoryDomain | null = null): void {
		this.#history.splice(this.#historyIndex + 1);
		this.#historyLinks.splice(this.#historyIndex + 1);
		this.#history.push(cloneState(this.#state));
		this.#historyLinks.push(historyLink);
		if (this.#history.length > HISTORY_LIMIT) {
			this.#history.shift();
			this.#historyLinks.shift();
		}
		this.#historyIndex = this.#history.length - 1;
		this.#commitListeners.forEach((listener) =>
			listener({ absorbsPrevious: historyLink !== null }),
		);
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
	private emitLinkedHistory(
		domain: LinkedHistoryDomain | null | undefined,
		direction: LinkedHistoryDirection,
	): void {
		if (!domain) return;
		this.#linkedHistoryListeners.forEach((listener) =>
			listener(domain, direction),
		);
	}

	private insertionIndex(): number {
		const activeIndex = this.#activeLayerId
			? this.#objectOrder.get(this.#activeLayerId)
			: undefined;
		return activeIndex === undefined ? 0 : activeIndex + 1;
	}

	private insertLayer(layer: AnnotationObject, index: number): void {
		layer.name ??= this.nextLayerName(layer.type);
		this.#state.objects.splice(index, 0, layer);
		if (index === this.#state.objects.length - 1) this.indexObject(layer, index);
		else this.rebuildObjectIndex();
	}

	private nextLayerName(type: AnnotationObject['type']): string {
		return new LayerNumbering(
			resolveLayerNames(this.#state.objects).values(),
		).next(type);
	}

	private keepExistingActiveLayer(): void {
		if (
			this.#activeLayerId !== null &&
			!this.#objectsById.has(this.#activeLayerId)
		)
			this.#activeLayerId = null;
	}

	private containsPoint(object: AnnotationObject, point: Point): boolean {
		if (object.type !== AnnotationObjectTypeId.RasterFragment) return containsPoint(object, point);
		if (!genericShape(object).contains(point)) return false;
		let surface = this.#rasterHitSurfaces.get(object.id);
		if (!surface) {
			surface = new RasterFragmentSurface(object);
			this.#rasterHitSurfaces.set(object.id, surface);
		}
		return surface.contains(object, point);
	}

	private rebuildObjectIndex(): void {
		this.#rasterHitSurfaces.clear();
		this.#objectsById.clear();
		this.#objectOrder.clear();
		this.#spatialIndex.clear();
		this.#state.objects.forEach((object, index) =>
			this.indexObject(object, index),
		);
	}

	private indexObject(object: AnnotationObject, order: number): void {
		this.#rasterHitSurfaces.delete(object.id);
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

export function isEphemeralAnnotationChange(
	change: AnnotationChangeKind,
): boolean {
	return (
		change === AnnotationChangeKind.Transient ||
		change === AnnotationChangeKind.Interaction
	);
}

export function annotationBounds(object: AnnotationObject): CropRect {
	return genericShape(object).geometry.rect;
}

export function normalizedRect(from: Point, to: Point): CropRect {
	return normalizeRectangle(from, to);
}

function containsPoint(object: AnnotationObject, point: Point): boolean {
	if (object.type === AnnotationObjectTypeId.Stroke)
		return strokeContainsPoint(
			object,
			point,
			Math.max(ARROW_HIT_MINIMUM, object.size * ARROW_HIT_WIDTH_FACTOR),
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

function normalizeHistoryLinks(
	links: readonly (LinkedHistoryDomain | null)[] | undefined,
	length: number,
): Array<LinkedHistoryDomain | null> {
	return Array.from({ length }, (_, index) => links?.[index] ?? null);
}

const EMPTY_OBJECT_IDS: ReadonlySet<string> = new Set<string>();
