import type { CanvasDocument } from '../../core/document/imageDocument';
import {
	BLEND_MODE_LABELS,
	BlendMode,
	CoreLayerId,
	type EditorLayer,
	isBlendMode,
	type LayerAppearanceChange,
	LayerKind,
	LayerOpacity,
} from '../../core/layers/layerTypes';
import { Numeric } from '../../shared/math/numericConstants';
import {
	AnnotationStackDirection,
	type AnnotationDocument,
	isEphemeralAnnotationChange,
} from '../annotations/annotationDocument';
import type {
	AnnotationObject,
	ContentLayer,
} from '../annotations/annotationTypes';
import { layerAppearance } from './layerAppearance';
import { layerItemLabel } from './layerItemLabels';
import {
	DRAG_SOURCE_CLASS,
	LayerListDrag,
	type LayerListEntry,
	LayerListEntryKind,
	markRowEntry,
} from './layerListDrag';
import { LayerMerger } from './layerMerge';
import { LayersPanel } from './layersPanel';

const VisibilitySymbol = { Visible: '◉', Hidden: '○' } as const;
/** One chevron; CSS turns it down while the layer is expanded. */
const EXPAND_SYMBOL = '›';
const ItemCountLabel = { Empty: 'Empty', One: 'item', Many: 'items' } as const;
const LayerActionSymbol = {
	Locked: '🔒',
	Unlocked: '🔓',
	Edit: '✎',
	Delete: '×',
	Forward: '↑',
	Backward: '↓',
	Drag: '⠿',
} as const;
const APPEARANCE_SEPARATOR = ' · ';
const PERCENT_SUFFIX = '%';
const IMAGE_LAYER_PLACEHOLDER = 'Image';
const SELECTION_KEY_SEPARATOR = '|';

/**
 * The layer list: the image, and above it the content layers, each expanded
 * to show its items top first. Rows select, show, hide, lock, delete and
 * reorder layers and items; the properties box edits the active layer.
 */
export class LayersController {
	readonly #editListeners = new Set<(layerId: string) => void>();
	readonly #itemChoiceListeners = new Set<(itemId: string) => void>();
	readonly #collapsedLayerIds = new Set<string>();
	#revealedSelection: string | null = null;
	readonly #drag: LayerListDrag;
	#opacityEditPending = false;
	readonly #merger: LayerMerger | null;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects?: AnnotationDocument,
		readonly panel = new LayersPanel(),
	) {
		this.#merger = objects ? new LayerMerger(documentModel, objects) : null;
		this.#drag = new LayerListDrag(panel.list, panel.list, (dragged, target) =>
			this.dropEntry(dragged, target),
		);
		this.panel.newPaintLayerButton.addEventListener('click', () =>
			this.objects?.createLayer(),
		);
		this.bindLayerProperties();
		documentModel.layers.onChange(() => this.render());
		objects?.onChange((_state, change) => {
			if (!isEphemeralAnnotationChange(change)) this.render();
		});
	}

	/** A layer row or its ✎ button: edit the whole layer with the Select tool. */
	onEditRequested(listener: (layerId: string) => void): void {
		this.#editListeners.add(listener);
	}

	/** An item row was chosen; the listener decides whether the tool must change. */
	onItemChosen(listener: (itemId: string) => void): void {
		this.#itemChoiceListeners.add(listener);
	}

	private render(): void {
		const { layers, activeLayerId } = this.documentModel.layers.state;
		const rows: HTMLElement[] = [];
		const activeLayer = this.objects?.activeLayer ?? null;
		const selectionChanged = this.trackSelection();
		for (const layer of [...layers].reverse()) {
			if (layer.kind === LayerKind.Objects && this.objects) {
				const contentLayers = this.objects.state.layers;
				[...contentLayers].reverse().forEach((content, index) => {
					rows.push(
						this.createContentLayerRow(
							content,
							index,
							contentLayers.length,
							content === activeLayer,
						),
					);
					if (!this.#collapsedLayerIds.has(content.id))
						rows.push(...this.createItemRows(content));
				});
				continue;
			}
			rows.push(
				this.createCoreLayerRow(
					layer,
					layer.id === activeLayerId && activeLayer === null,
				),
			);
		}
		this.panel.list.replaceChildren(...rows);
		this.syncLayerProperties(activeLayer);
		if (selectionChanged) this.revealSelectedRow();
	}

	/**
	 * Notes a new selection, opening the layer of a newly selected item so its
	 * row can be shown. Returns whether the selection changed.
	 */
	private trackSelection(): boolean {
		const selectedId = this.objects?.selectedId ?? null;
		const key = `${selectedId ?? ''}${SELECTION_KEY_SEPARATOR}${this.objects?.activeLayer?.id ?? ''}`;
		if (key === this.#revealedSelection) return false;
		this.#revealedSelection = key;
		const itemLayer = selectedId ? this.objects?.layerOf(selectedId) : null;
		if (itemLayer) this.#collapsedLayerIds.delete(itemLayer.id);
		return true;
	}

	/** Scrolls the list just enough to show the selected item, or else the active layer. */
	private revealSelectedRow(): void {
		const list = this.panel.list;
		const row =
			list.querySelector<HTMLElement>('.layer-item-row.active') ??
			list.querySelector<HTMLElement>('.layer-row.active');
		if (!row) return;
		const rowBox = row.getBoundingClientRect();
		const listBox = list.getBoundingClientRect();
		if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top;
		else if (rowBox.bottom > listBox.bottom)
			list.scrollTop += rowBox.bottom - listBox.bottom;
	}

	private bindLayerProperties(): void {
		const { nameInput, blendModeSelect, opacityInput } = this.panel;
		this.panel.duplicateLayerButton.addEventListener('click', () => {
			const active = this.objects?.activeLayer;
			if (active) this.objects?.duplicateLayer(active.id);
		});
		this.panel.mergeDownButton.addEventListener('click', () => {
			const active = this.objects?.activeLayer;
			if (active) this.#merger?.mergeDown(active.id);
		});
		this.panel.flattenButton.addEventListener('click', () => this.#merger?.flatten());
		nameInput.addEventListener('change', () =>
			this.changeActiveLayer({ name: nameInput.value }),
		);
		nameInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') nameInput.blur();
			if (event.key !== 'Escape') return;
			nameInput.value = this.objects?.activeLayer?.name ?? '';
			nameInput.blur();
		});
		blendModeSelect.addEventListener('change', () => {
			const blendMode = blendModeSelect.value;
			if (isBlendMode(blendMode)) this.changeActiveLayer({ blendMode });
		});
		opacityInput.addEventListener('input', () => {
			this.#opacityEditPending = true;
			this.changeActiveLayer(
				{ opacity: Number(opacityInput.value) / Numeric.PercentScale },
				false,
			);
			this.showOpacity(Number(opacityInput.value));
		});
		opacityInput.addEventListener('change', () => {
			if (!this.#opacityEditPending) return;
			this.#opacityEditPending = false;
			this.objects?.commitCurrent();
		});
	}

	private changeActiveLayer(
		change: LayerAppearanceChange,
		commit = true,
	): void {
		const active = this.objects?.activeLayer;
		if (active) this.objects?.setLayerAppearance(active.id, change, commit);
	}

	private syncLayerProperties(active: ContentLayer | null): void {
		const { properties, nameInput, blendModeSelect, opacityInput } =
			this.panel;
		properties.disabled = active === null;
		this.panel.duplicateLayerButton.disabled = active === null;
		this.panel.mergeDownButton.disabled =
			active === null || !this.#merger?.canMergeDown(active.id);
		this.panel.flattenButton.disabled = !this.#merger?.canFlatten();
		const appearance = active
			? layerAppearance(active)
			: { opacity: LayerOpacity.Opaque, blendMode: BlendMode.Normal };
		if (document.activeElement !== nameInput) nameInput.value = active?.name ?? '';
		nameInput.placeholder = active ? '' : IMAGE_LAYER_PLACEHOLDER;
		blendModeSelect.value = appearance.blendMode;
		const opacityPercent = Math.round(appearance.opacity * Numeric.PercentScale);
		if (!this.#opacityEditPending) opacityInput.value = String(opacityPercent);
		this.showOpacity(opacityPercent);
	}

	private showOpacity(percent: number): void {
		this.panel.opacityOutput.value = `${percent}${PERCENT_SUFFIX}`;
	}

	/** The image row. */
	private createCoreLayerRow(layer: EditorLayer, selected: boolean): HTMLElement {
		const row = document.createElement('div');
		row.className = 'layer-row';
		row.dataset.layerId = layer.id;
		row.classList.toggle('locked', layer.locked);
		this.bindSelectableRow(row, selected, () => this.activateCoreLayer(layer.id));
		const visibility = this.actionButton(
			layer.visible ? VisibilitySymbol.Visible : VisibilitySymbol.Hidden,
			`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`,
			() => this.documentModel.layers.setVisible(layer.id, !layer.visible),
		);
		visibility.className = 'layer-visibility';
		const name = this.actionButton(layer.name, layer.name, () =>
			this.activateCoreLayer(layer.id),
		);
		name.className = 'layer-name';
		const lock = this.lockButton(layer.locked, layer.name, () =>
			this.documentModel.layers.setLocked(layer.id, !layer.locked),
		);
		const edit = this.actionButton(
			LayerActionSymbol.Edit,
			`Edit ${layer.name}`,
			() => this.activateCoreLayer(layer.id),
		);
		edit.className = 'layer-edit';
		row.append(visibility, name, lock, edit);
		return row;
	}

	private activateCoreLayer(layerId: string): void {
		this.objects?.activate(null);
		this.documentModel.layers.select(layerId);
	}

	private createContentLayerRow(
		layer: ContentLayer,
		indexFromTop: number,
		layerCount: number,
		active: boolean,
	): HTMLElement {
		const entry = { kind: LayerListEntryKind.Layer, id: layer.id } as const;
		const row = document.createElement('div');
		row.className = 'layer-row layer-object-row';
		row.dataset.contentLayerId = layer.id;
		markRowEntry(row, entry);
		row.classList.toggle('locked', layer.locked === true);
		row.classList.toggle(DRAG_SOURCE_CLASS, this.#drag.isDragging(entry));
		const choose = () => this.chooseLayer(layer.id);
		this.bindSelectableRow(row, active, choose);
		const handle = this.dragHandle(row, entry, layer.name);
		const expanded = !this.#collapsedLayerIds.has(layer.id);
		const expand = this.actionButton(
			EXPAND_SYMBOL,
			`${expanded ? 'Hide' : 'Show'} the items of ${layer.name}`,
			() => this.toggleExpanded(layer.id),
		);
		expand.className = 'layer-expand';
		expand.setAttribute('aria-expanded', String(expanded));
		const visibility = this.visibilityButton(
			layer.visible !== false,
			layer.name,
			() => this.objects?.setLayerVisible(layer.id, layer.visible === false),
		);
		const name = this.actionButton(layer.name, `Select ${layer.name}`, choose);
		name.className = 'layer-name';
		const badge = document.createElement('span');
		badge.className = 'layer-appearance';
		badge.textContent = layerSummary(layer);
		name.append(badge);
		const moveForward = this.actionButton(
			LayerActionSymbol.Forward,
			`Move ${layer.name} forward`,
			() => this.objects?.reorderLayer(layer.id, AnnotationStackDirection.Forward),
		);
		moveForward.className = 'layer-forward';
		moveForward.disabled = indexFromTop === 0;
		const moveBackward = this.actionButton(
			LayerActionSymbol.Backward,
			`Move ${layer.name} backward`,
			() => this.objects?.reorderLayer(layer.id, AnnotationStackDirection.Backward),
		);
		moveBackward.className = 'layer-backward';
		moveBackward.disabled = indexFromTop === layerCount - 1;
		const lock = this.lockButton(layer.locked === true, layer.name, () =>
			this.objects?.setLayerLocked(layer.id, layer.locked !== true),
		);
		const edit = this.actionButton(LayerActionSymbol.Edit, `Edit ${layer.name}`, () =>
			this.chooseLayer(layer.id),
		);
		edit.className = 'layer-edit';
		edit.disabled = !this.objects?.isLayerEditable(layer.id);
		const remove = this.actionButton(
			LayerActionSymbol.Delete,
			`Delete ${layer.name}`,
			() => this.objects?.removeLayer(layer.id),
		);
		remove.className = 'layer-delete';
		row.append(handle, expand, visibility, name, moveForward, moveBackward, lock, edit, remove);
		return row;
	}

	private createItemRows(layer: ContentLayer): HTMLElement[] {
		return (this.objects?.layerItems(layer.id) ?? [])
			.reverse()
			.map((item) => this.createItemRow(item));
	}

	private createItemRow(item: AnnotationObject): HTMLElement {
		const entry = { kind: LayerListEntryKind.Item, id: item.id } as const;
		const label = layerItemLabel(item);
		const row = document.createElement('div');
		row.className = 'layer-row layer-item-row';
		row.dataset.objectId = item.id;
		markRowEntry(row, entry);
		row.classList.toggle('locked', item.locked === true);
		row.classList.toggle(DRAG_SOURCE_CLASS, this.#drag.isDragging(entry));
		const choose = () => this.chooseItem(item.id);
		this.bindSelectableRow(row, this.objects?.selectedId === item.id, choose);
		const handle = this.dragHandle(row, entry, label);
		const visibility = this.visibilityButton(item.visible !== false, label, () =>
			this.objects?.setVisible(item.id, item.visible === false),
		);
		const name = this.actionButton(label, `Select ${label}`, choose);
		name.className = 'layer-name';
		const lock = this.lockButton(item.locked === true, label, () =>
			this.objects?.setLocked(item.id, item.locked !== true),
		);
		const remove = this.actionButton(LayerActionSymbol.Delete, `Delete ${label}`, () =>
			this.objects?.remove(item.id),
		);
		remove.className = 'layer-delete';
		row.append(handle, visibility, name, lock, remove);
		return row;
	}

	/**
	 * A layer row selects the whole layer and shows it on the canvas with the
	 * Select tool. A hidden or locked layer only becomes active.
	 */
	private chooseLayer(layerId: string): void {
		this.documentModel.layers.select(CoreLayerId.Objects);
		this.objects?.selectLayer(layerId);
		if (this.objects?.isLayerEditable(layerId))
			this.#editListeners.forEach((listener) => listener(layerId));
	}

	private chooseItem(itemId: string): void {
		if (!this.objects) return;
		this.documentModel.layers.select(CoreLayerId.Objects);
		if (!this.objects.isEditable(itemId)) {
			this.objects.activate(this.objects.layerOf(itemId)?.id ?? null);
			return;
		}
		this.objects.select(itemId);
		this.#itemChoiceListeners.forEach((listener) => listener(itemId));
	}

	private toggleExpanded(layerId: string): void {
		if (!this.#collapsedLayerIds.delete(layerId))
			this.#collapsedLayerIds.add(layerId);
		this.render();
	}

	private dropEntry(dragged: LayerListEntry, target: LayerListEntry): void {
		const objects = this.objects;
		if (!objects) return;
		if (dragged.kind === LayerListEntryKind.Item) {
			if (target.kind === LayerListEntryKind.Item)
				objects.moveItemTo(dragged.id, target.id);
			else objects.moveItemToLayer(dragged.id, target.id);
			return;
		}
		const targetLayerId =
			target.kind === LayerListEntryKind.Layer
				? target.id
				: objects.layerOf(target.id)?.id;
		if (targetLayerId) objects.moveLayerTo(dragged.id, targetLayerId);
	}

	private dragHandle(
		row: HTMLElement,
		entry: LayerListEntry,
		label: string,
	): HTMLButtonElement {
		const handle = this.actionButton(
			LayerActionSymbol.Drag,
			`Drag ${label} to reorder`,
			() => undefined,
		);
		handle.className = 'layer-drag-handle';
		this.#drag.bind(handle, row, entry, label);
		return handle;
	}

	private visibilityButton(
		visible: boolean,
		label: string,
		toggle: () => void,
	): HTMLButtonElement {
		const button = this.actionButton(
			visible ? VisibilitySymbol.Visible : VisibilitySymbol.Hidden,
			`${visible ? 'Hide' : 'Show'} ${label}`,
			toggle,
		);
		button.className = 'layer-visibility';
		return button;
	}

	private lockButton(
		locked: boolean,
		label: string,
		toggle: () => void,
	): HTMLButtonElement {
		const button = this.actionButton(
			locked ? LayerActionSymbol.Locked : LayerActionSymbol.Unlocked,
			`${locked ? 'Unlock' : 'Lock'} ${label}`,
			toggle,
		);
		button.className = 'layer-lock';
		button.setAttribute('aria-pressed', String(locked));
		return button;
	}

	private bindSelectableRow(
		row: HTMLElement,
		selected: boolean,
		select: () => void,
	): void {
		row.role = 'option';
		row.tabIndex = 0;
		row.setAttribute('aria-selected', String(selected));
		row.classList.toggle('active', selected);
		row.addEventListener('click', (event) => {
			if (event.target === row) select();
		});
		row.addEventListener('keydown', (event) => {
			if (event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
			event.preventDefault();
			select();
		});
	}

	private actionButton(
		content: string,
		label: string,
		action: () => void,
	): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = content;
		button.title = label;
		button.setAttribute('aria-label', label);
		button.addEventListener('click', action);
		return button;
	}
}

/** "4 items · 50% · Multiply": what a layer holds, and how it composites when not normally. */
function layerSummary(layer: ContentLayer): string {
	const { opacity, blendMode } = layerAppearance(layer);
	const parts = [itemCount(layer.itemIds.length)];
	if (opacity !== LayerOpacity.Opaque)
		parts.push(`${Math.round(opacity * Numeric.PercentScale)}${PERCENT_SUFFIX}`);
	if (blendMode !== BlendMode.Normal) parts.push(BLEND_MODE_LABELS[blendMode]);
	return parts.join(APPEARANCE_SEPARATOR);
}

function itemCount(count: number): string {
	if (count === 0) return ItemCountLabel.Empty;
	return `${count} ${count === 1 ? ItemCountLabel.One : ItemCountLabel.Many}`;
}
