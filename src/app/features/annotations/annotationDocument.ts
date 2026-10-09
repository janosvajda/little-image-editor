import type { CropRect, Point } from '../../core/document/appTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type AnnotationSessionState,
	type AnnotationState,
	type AnnotationStateInput,
	type ContentLayer,
	type LinkedHistoryDomain,
	type RasterFragmentAnnotation,
} from './annotationTypes';
import {
	enclosingBounds,
	orientedBounds,
	ShapeHandleId,
	type ShapeHandle,
	type TransformableGeometry,
} from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import type { RotationDrag } from '../../core/geometry/shapeInteraction';
import { normalizedRect as normalizeRectangle } from '../../core/geometry/geometryHelpers';
import { EditorLimit } from '../../core/document/editorLimits';
import { ObjectSpatialIndex } from './objectSpatialIndex';
import { strokeContainsPoint } from './strokeGeometry';
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
} from '../layers/layerAppearance';
import {
	emptyAnnotationState,
	itemsInLayerOrder,
	normalizeAnnotationState,
} from './contentLayerStructure';

const HISTORY_LIMIT = EditorLimit.EditableObjectHistory;
const ARROW_HIT_MINIMUM = 8;
const ARROW_HIT_WIDTH_FACTOR = 2;
const MINIMUM_POLYGON_POINTS = 3;

/** A whole layer being dragged: how far it has moved since the drag began. */
export interface LayerMotion {
	readonly layerId: string;
	readonly offset: Point;
}

export interface AnnotationRenderState {
	readonly revision: number;
	readonly staticRevision: number;
	readonly changedObjectId: string | null;
	readonly interactionActive: boolean;
	/** Set while a whole layer is dragged, so rendering can shift it instead of redrawing it. */
	readonly layerMotion?: LayerMotion;
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

/**
 * Content layers and the items inside them. One layer is active: it receives
 * new items. Either one item or one whole layer can be selected for editing.
 */
export class AnnotationDocument implements HistoryParticipant {
	#state: AnnotationState = emptyAnnotationState();
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
	readonly #layersById = new Map<string, ContentLayer>();
	readonly #layerOfItem = new Map<string, ContentLayer>();
	#renderState: AnnotationRenderState = {
		revision: 0,
		staticRevision: 0,
		changedObjectId: null,
		interactionActive: false,
	};
	selectedId: string | null = null;
	#selectedLayerId: string | null = null;
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
		const selectedLayerId = this.#selectedLayerId;
		const activeLayerId = this.#activeLayerId;
		return () => {
			this.#state = cloneState(state);
			this.#history = [...history];
			this.#historyLinks = [...historyLinks];
			this.#historyIndex = historyIndex;
			this.selectedId = selectedId;
			this.#selectedLayerId = selectedLayerId;
			this.#activeLayerId = activeLayerId;
			this.rebuildObjectIndex();
			this.markRenderedContentChanged(null, false);
			this.emit(AnnotationChangeKind.Committed);
			this.emitHistory();
		};
	}

	/**
	 * The layer that receives new items and above which new layers are
	 * created. `null` means the image layer. It survives tool changes and
	 * deselection.
	 */
	get activeLayer(): ContentLayer | null {
		return this.layer(this.#activeLayerId);
	}

	/** The layer selected as a whole, so it can be moved with all of its items. */
	get selectedLayer(): ContentLayer | null {
		return this.layer(this.#selectedLayerId);
	}

	layer(id: string | null): ContentLayer | null {
		return id ? (this.#layersById.get(id) ?? null) : null;
	}

	/** The layer holding an item. */
	layerOf(itemId: string): ContentLayer | null {
		return this.#layerOfItem.get(itemId) ?? null;
	}

	/** A layer's items, bottom first. */
	layerItems(layerId: string): AnnotationObject[] {
		const layer = this.layer(layerId);
		return layer ? itemsInLayerOrder([layer], this.#objectsById) : [];
	}

	/** The axis-aligned area covered by a layer's visible items; `null` when it shows nothing. */
	layerBounds(layerId: string): CropRect | null {
		return enclosingBounds(this.visibleItemGeometries(layerId));
	}

	/** A layer's frame, turned with the layer, around its visible items; `null` when empty. */
	layerFrame(layerId: string): TransformableGeometry | null {
		return orientedBounds(
			this.visibleItemGeometries(layerId),
			this.layer(layerId)?.rotation ?? 0,
		);
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

	restore(state?: AnnotationStateInput): void {
		this.#state = state
			? normalizeAnnotationState(structuredClone(state))
			: emptyAnnotationState();
		this.#history = [cloneState(this.#state)];
		this.#historyLinks = [null];
		this.#historyIndex = 0;
		this.selectedId = null;
		this.#selectedLayerId = null;
		this.#activeLayerId = this.#state.layers.at(-1)?.id ?? null;
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	restoreSession(session: AnnotationSessionState): void {
		const complete = (state: AnnotationStateInput) =>
			normalizeAnnotationState(structuredClone(state));
		this.#history =
			session.history.length > 0
				? session.history.map(complete)
				: [complete(session.state)];
		this.#historyIndex = Math.max(
			0,
			Math.min(session.historyIndex, this.#history.length - 1),
		);
		this.#state = complete(session.state);
		this.#history[this.#historyIndex] = cloneState(this.#state);
		this.#historyLinks = normalizeHistoryLinks(
			session.historyLinks,
			this.#history.length,
		);
		this.selectedId = null;
		this.#selectedLayerId = null;
		this.#activeLayerId = this.#state.layers.at(-1)?.id ?? null;
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	/**
	 * Adds an item on top of the active layer and selects it. With the image
	 * active, a new layer is created for it first, as part of the same step.
	 */
	add(
		object: AnnotationObject,
		commit = true,
		historyLink: LinkedHistoryDomain | null = null,
	): void {
		const layer = this.activeLayer ?? this.insertNewLayer();
		this.placeItem(structuredClone(object), layer, layer.itemIds.length);
		this.markRenderedContentChanged(object.id, !commit);
		if (object.type === AnnotationObjectTypeId.Step)
			this.#state.nextStep = Math.max(this.#state.nextStep, object.value + 1);
		this.selectedId = object.id;
		this.#selectedLayerId = null;
		this.#activeLayerId = layer.id;
		if (commit) this.commit(historyLink);
		else this.emit(AnnotationChangeKind.Transient);
	}

	/**
	 * Adds an item to a layer at a stack position (0 is the bottom) as one
	 * step, keeping the current selection, so tools can keep working in it.
	 */
	insertItem(object: AnnotationObject, layerId: string, index: number): void {
		const layer = this.layer(layerId);
		if (!layer) return;
		const position = Math.max(0, Math.min(index, layer.itemIds.length));
		this.placeItem(structuredClone(object), layer, position);
		this.markRenderedContentChanged(null, false);
		this.commit();
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

	/**
	 * Selects one item for editing and makes its layer active. `null` only
	 * deselects; the active layer stays.
	 */
	select(id: string | null): void {
		const layer = id ? this.layerOf(id) : null;
		const selectedId = layer ? id : null;
		const activeLayerId = layer?.id ?? this.#activeLayerId;
		if (
			this.selectedId === selectedId &&
			this.#selectedLayerId === null &&
			this.#activeLayerId === activeLayerId
		)
			return;
		this.selectedId = selectedId;
		this.#selectedLayerId = null;
		this.#activeLayerId = activeLayerId;
		this.emit(AnnotationChangeKind.Selection);
	}

	/** Selects a whole layer, so all of its items move together, and makes it active. */
	selectLayer(layerId: string): void {
		if (!this.#layersById.has(layerId)) return;
		if (
			this.#selectedLayerId === layerId &&
			this.selectedId === null &&
			this.#activeLayerId === layerId
		)
			return;
		this.selectedId = null;
		this.#selectedLayerId = layerId;
		this.#activeLayerId = layerId;
		this.emit(AnnotationChangeKind.Selection);
	}

	/** Makes a layer active without selecting anything in it; `null` is the image. */
	activate(layerId: string | null): void {
		const activeLayerId = this.#layersById.has(layerId ?? '') ? layerId : null;
		const keepsItem =
			this.selectedId !== null &&
			this.#layerOfItem.get(this.selectedId)?.id === activeLayerId;
		const keepsLayer = this.#selectedLayerId === activeLayerId;
		if (
			this.#activeLayerId === activeLayerId &&
			(this.selectedId === null || keepsItem) &&
			(this.#selectedLayerId === null || keepsLayer)
		)
			return;
		this.#activeLayerId = activeLayerId;
		if (!keepsItem) this.selectedId = null;
		if (!keepsLayer) this.#selectedLayerId = null;
		this.emit(AnnotationChangeKind.Selection);
	}

	/** Hides transform controls; the active layer stays, as when switching tools. */
	clearSelection(): void {
		if (this.selectedId === null && this.#selectedLayerId === null) return;
		this.selectedId = null;
		this.#selectedLayerId = null;
		this.emit(AnnotationChangeKind.Selection);
	}

	layerName(layerId: string): string {
		return this.layer(layerId)?.name ?? '';
	}

	setLayerAppearance(
		layerId: string,
		change: LayerAppearanceChange,
		commit = true,
	): void {
		const layer = this.layer(layerId);
		const name = change.name?.trim();
		if (
			!layer ||
			name === '' ||
			(change.opacity !== undefined && !isLayerOpacity(change.opacity))
		)
			return;
		const current = layerAppearance(layer);
		const next = { ...current, ...change, ...(name ? { name } : {}) };
		if (
			next.name === current.name &&
			next.opacity === current.opacity &&
			next.blendMode === current.blendMode
		)
			return;
		applyLayerAppearance(layer, next);
		this.changeStructure(commit);
	}

	/** Copies a layer and its items directly above itself and selects the copy. */
	duplicateLayer(layerId: string): string | null {
		const source = this.layer(layerId);
		if (!source) return null;
		const copy: ContentLayer = {
			...structuredClone(source),
			id: crypto.randomUUID(),
			name: duplicateLayerName(source.name),
			itemIds: [],
		};
		for (const item of this.layerItems(layerId)) {
			const itemCopy = structuredClone(item);
			itemCopy.id = crypto.randomUUID();
			copy.itemIds.push(itemCopy.id);
			this.#objectsById.set(itemCopy.id, itemCopy);
		}
		this.#state.layers.splice(this.#state.layers.indexOf(source) + 1, 0, copy);
		this.selectedId = null;
		this.#selectedLayerId = copy.id;
		this.#activeLayerId = copy.id;
		this.changeStructure();
		return copy.id;
	}

	/** Adds an empty layer directly above the active layer and makes it active. */
	createLayer(): string {
		const layer = this.insertNewLayer();
		this.selectedId = null;
		this.#selectedLayerId = null;
		this.#activeLayerId = layer.id;
		this.commit();
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

	/** Deletes the selected item, or the selected layer with its items. */
	removeSelected(): void {
		if (this.selectedId) this.remove(this.selectedId);
		else if (this.#selectedLayerId) this.removeLayer(this.#selectedLayerId);
	}

	/** Deletes an item; its layer stays, even when it becomes empty. */
	remove(id: string, historyLink: LinkedHistoryDomain | null = null): void {
		const layer = this.layerOf(id);
		if (!layer) return;
		layer.itemIds = layer.itemIds.filter((itemId) => itemId !== id);
		this.#objectsById.delete(id);
		if (this.selectedId === id) this.selectedId = null;
		this.changeStructure(true, historyLink);
	}

	/** Deletes a layer with its items; activation passes to the layer beneath it. */
	removeLayer(
		layerId: string,
		historyLink: LinkedHistoryDomain | null = null,
	): void {
		const layer = this.layer(layerId);
		if (!layer) return;
		const index = this.#state.layers.indexOf(layer);
		this.#state.layers.splice(index, 1);
		const removed = new Set(layer.itemIds);
		if (this.selectedId && removed.has(this.selectedId)) this.selectedId = null;
		if (this.#selectedLayerId === layerId) this.#selectedLayerId = null;
		if (this.#activeLayerId === layerId)
			this.#activeLayerId =
				this.#state.layers[index - 1]?.id ??
				this.#state.layers[index]?.id ??
				null;
		this.changeStructure(true, historyLink);
	}

	/** Moves a layer's items, unchanged, on top of the layer beneath it, and removes the layer. */
	mergeItemsDown(layerId: string): void {
		const layer = this.layer(layerId);
		const below = this.layerBelow(layerId);
		if (!layer || !below) return;
		below.itemIds.push(...layer.itemIds);
		this.#state.layers.splice(this.#state.layers.indexOf(layer), 1);
		this.selectLayerAfterMerge(below.id);
		this.changeStructure();
	}

	/** Replaces a layer and the one beneath it with one item in the lower layer. */
	mergeLayersInto(
		belowId: string,
		upperId: string,
		replacement: AnnotationObject,
	): void {
		const below = this.layer(belowId);
		const upper = this.layer(upperId);
		if (!below || !upper || this.layerBelow(upperId) !== below) return;
		const item = structuredClone(replacement);
		this.#objectsById.set(item.id, item);
		below.itemIds = [item.id];
		this.#state.layers.splice(this.#state.layers.indexOf(upper), 1);
		this.selectLayerAfterMerge(below.id);
		this.changeStructure();
	}

	layerBelow(layerId: string): ContentLayer | null {
		const layer = this.layer(layerId);
		return layer
			? (this.#state.layers[this.#state.layers.indexOf(layer) - 1] ?? null)
			: null;
	}

	/** Moves a layer one step up (forward) or down (backward) in the stack. */
	reorderLayer(layerId: string, direction: AnnotationStackDirection): void {
		const layer = this.layer(layerId);
		if (!layer) return;
		const index = this.#state.layers.indexOf(layer);
		const target = index + stackOffset(direction);
		const other = this.#state.layers[target];
		if (!other) return;
		this.#state.layers[target] = layer;
		this.#state.layers[index] = other;
		this.changeStructure();
	}

	/** Puts a layer in another layer's place in the stack. */
	moveLayerTo(layerId: string, targetLayerId: string): void {
		const layer = this.layer(layerId);
		const target = this.layer(targetLayerId);
		if (!layer || !target || layer === target) return;
		const targetIndex = this.#state.layers.indexOf(target);
		this.#state.layers.splice(this.#state.layers.indexOf(layer), 1);
		this.#state.layers.splice(targetIndex, 0, layer);
		this.changeStructure();
	}

	/** Moves an item one step up (forward) or down (backward) inside its layer. */
	reorder(id: string, direction: AnnotationStackDirection): void {
		const layer = this.layerOf(id);
		if (!layer) return;
		const index = layer.itemIds.indexOf(id);
		const target = index + stackOffset(direction);
		const other = layer.itemIds[target];
		if (other === undefined) return;
		layer.itemIds[target] = id;
		layer.itemIds[index] = other;
		this.changeStructure();
	}

	/** Puts an item in another item's place, moving it into that item's layer if needed. */
	moveItemTo(id: string, targetId: string): void {
		const source = this.layerOf(id);
		const target = this.layerOf(targetId);
		if (!source || !target || id === targetId) return;
		const targetIndex = target.itemIds.indexOf(targetId);
		source.itemIds.splice(source.itemIds.indexOf(id), 1);
		target.itemIds.splice(targetIndex, 0, id);
		this.moveSelectionWith(id, target.id);
		this.changeStructure();
	}

	/** Moves an item on top of another layer's items. */
	moveItemToLayer(id: string, layerId: string): void {
		const source = this.layerOf(id);
		const target = this.layer(layerId);
		if (!source || !target || source === target) return;
		source.itemIds.splice(source.itemIds.indexOf(id), 1);
		target.itemIds.push(id);
		this.moveSelectionWith(id, target.id);
		this.changeStructure();
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

	setLayerVisible(layerId: string, visible: boolean): void {
		this.changeLayerAccess(layerId, (layer) => {
			layer.visible = visible;
		});
	}

	setLayerLocked(layerId: string, locked: boolean): void {
		this.changeLayerAccess(layerId, (layer) => {
			layer.locked = locked;
		});
	}

	/** An item can be edited when it and its layer are visible and unlocked. */
	isEditable(id: string): boolean {
		const object = this.#objectsById.get(id);
		const layer = this.#layerOfItem.get(id);
		return Boolean(
			object &&
				object.visible !== false &&
				object.locked !== true &&
				layer &&
				this.isLayerEditable(layer.id),
		);
	}

	isLayerEditable(layerId: string): boolean {
		const layer = this.layer(layerId);
		return Boolean(layer && layer.visible !== false && layer.locked !== true);
	}

	clear(historyLink: LinkedHistoryDomain | null = null): void {
		if (this.#state.layers.length === 0) return;
		this.#state = emptyAnnotationState();
		this.rebuildObjectIndex();
		this.markRenderedContentChanged(null, false);
		this.selectedId = null;
		this.#selectedLayerId = null;
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
		this.#selectedLayerId = null;
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
		this.#selectedLayerId = null;
		this.keepExistingActiveLayer();
		this.emit(AnnotationChangeKind.Committed);
		this.emitHistory();
	}

	/** The topmost item under a point that can be edited. */
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
				!this.isEditable(id) ||
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
		for (const layer of this.#state.layers)
			layer.itemIds = layer.itemIds.filter((id) => !ids.has(id));
		this.restructure();
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

	/**
	 * Moves every item of a layer together. An uncommitted move is reported as
	 * a layer motion, accumulated until the move is committed or cancelled.
	 */
	moveLayer(layerId: string, delta: Point, commit = true): void {
		const motion = this.#renderState.layerMotion;
		const offset =
			motion?.layerId === layerId
				? { x: motion.offset.x + delta.x, y: motion.offset.y + delta.y }
				: delta;
		this.updateLayerItems(layerId, (item) => genericShape(item).move(delta), commit);
		if (!commit && this.layer(layerId))
			this.#renderState = { ...this.#renderState, layerMotion: { layerId, offset } };
	}

	/**
	 * Transforms a whole layer: its frame takes `frameRotation` and each item
	 * is placed by `place`, as one edit.
	 */
	transformLayer(
		layerId: string,
		frameRotation: number,
		place: (item: AnnotationObject) => void,
		commit = true,
	): void {
		const layer = this.layer(layerId);
		if (!layer) return;
		layer.rotation = normalizedDegrees(frameRotation);
		this.updateLayerItems(layerId, place, commit);
	}

	/** Changes every item of a layer as one edit, such as a whole-layer move. */
	updateLayerItems(
		layerId: string,
		updater: (item: AnnotationObject) => void,
		commit = true,
	): void {
		const items = this.layerItems(layerId);
		if (items.length === 0) return;
		for (const item of items) {
			updater(item);
			// Geometry only changes, so the stack keeps its order and only these items reindex.
			this.indexObject(item, this.#objectOrder.get(item.id) ?? 0);
		}
		this.markRenderedContentChanged(null, false);
		if (commit) this.commit();
		else this.emit(AnnotationChangeKind.Transient);
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
		fragment.pixelClips ??= [];
		fragment.pixelClips.push(mask);
		genericShape(fragment).move(delta);
		this.insertAbove(fragment, id);
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
		this.insertAbove(fragment, id);
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
		const { layerMotion: _finished, ...renderState } = this.#renderState;
		this.#renderState = {
			...renderState,
			staticRevision: renderState.staticRevision + 1,
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

	/** Creates an empty layer directly above the active layer, or above the image. */
	private insertNewLayer(): ContentLayer {
		const layer: ContentLayer = {
			id: crypto.randomUUID(),
			name: new LayerNumbering(
				this.#state.layers.map((existing) => existing.name),
			).next(),
			itemIds: [],
		};
		const active = this.activeLayer;
		const index = active ? this.#state.layers.indexOf(active) + 1 : 0;
		this.#state.layers.splice(index, 0, layer);
		this.#layersById.set(layer.id, layer);
		return layer;
	}

	private placeItem(
		item: AnnotationObject,
		layer: ContentLayer,
		index: number,
	): void {
		layer.itemIds.splice(index, 0, item.id);
		const onTop =
			layer === this.#state.layers.at(-1) && index === layer.itemIds.length - 1;
		if (!onTop) {
			this.#objectsById.set(item.id, item);
			this.restructure();
			return;
		}
		this.#state.objects.push(item);
		this.#layerOfItem.set(item.id, layer);
		this.indexObject(item, this.#state.objects.length - 1);
	}

	/** Places a new item directly above another, in the same layer, and selects it. */
	private insertAbove(item: AnnotationObject, belowId: string): void {
		const layer = this.layerOf(belowId);
		if (!layer) return;
		this.placeItem(item, layer, layer.itemIds.indexOf(belowId) + 1);
		this.selectedId = item.id;
		this.#selectedLayerId = null;
		this.#activeLayerId = layer.id;
		this.markRenderedContentChanged(null, false);
		this.commit();
	}

	private selectLayerAfterMerge(layerId: string): void {
		this.selectedId = null;
		this.#selectedLayerId = null;
		this.#activeLayerId = layerId;
	}

	private moveSelectionWith(itemId: string, layerId: string): void {
		if (this.selectedId === itemId) this.#activeLayerId = layerId;
	}

	private changeLayerAccess(
		layerId: string,
		change: (layer: ContentLayer) => void,
	): void {
		const layer = this.layer(layerId);
		if (!layer) return;
		change(layer);
		if (!this.isLayerEditable(layerId)) {
			if (this.selectedId && this.layerOf(this.selectedId) === layer)
				this.selectedId = null;
			if (this.#selectedLayerId === layerId) this.#selectedLayerId = null;
		}
		this.changeStructure();
	}

	/** Re-derives render order after a structural edit, then records or previews it. */
	private changeStructure(
		commit = true,
		historyLink: LinkedHistoryDomain | null = null,
	): void {
		this.restructure();
		this.markRenderedContentChanged(null, false);
		if (commit) this.commit(historyLink);
		else this.emit(AnnotationChangeKind.Transient);
	}

	/** `#objectsById` holds every item still referenced; `layers` decides which remain and in what order. */
	private restructure(): void {
		this.#state.objects = itemsInLayerOrder(
			this.#state.layers,
			this.#objectsById,
		);
		this.rebuildObjectIndex();
	}

	private visibleItemGeometries(layerId: string): TransformableGeometry[] {
		return this.layerItems(layerId)
			.filter((item) => item.visible !== false)
			.map((item) => genericShape(item).geometry);
	}

	private keepExistingActiveLayer(): void {
		if (
			this.#activeLayerId !== null &&
			!this.#layersById.has(this.#activeLayerId)
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
		this.#layersById.clear();
		this.#layerOfItem.clear();
		for (const layer of this.#state.layers) {
			this.#layersById.set(layer.id, layer);
			for (const id of layer.itemIds) this.#layerOfItem.set(id, layer);
		}
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

const FULL_TURN_DEGREES = 360;

function normalizedDegrees(degrees: number): number {
	return ((degrees % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;
}

function stackOffset(direction: AnnotationStackDirection): number {
	return direction === AnnotationStackDirection.Forward ? 1 : -1;
}

function normalizeHistoryLinks(
	links: readonly (LinkedHistoryDomain | null)[] | undefined,
	length: number,
): Array<LinkedHistoryDomain | null> {
	return Array.from({ length }, (_, index) => links?.[index] ?? null);
}

const EMPTY_OBJECT_IDS: ReadonlySet<string> = new Set<string>();
