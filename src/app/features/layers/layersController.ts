import type { CanvasDocument } from '../../core/document/imageDocument';
import {
	CoreLayerId,
	LayerKind,
	type EditorLayer,
} from '../../core/layers/layerTypes';
import {
	AnnotationStackDirection,
	type AnnotationDocument,
	isEphemeralAnnotationChange,
} from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
} from '../annotations/annotationTypes';
import { LayersPanel } from './layersPanel';

const VisibilitySymbol = { Visible: '◉', Hidden: '○' } as const;
const DRAG_TARGET_CLASS = 'drag-target';
const DRAG_SOURCE_CLASS = 'dragging-source';
const DRAG_PREVIEW_CLASS = 'layer-drag-preview';
const DRAG_SCROLL_EDGE_PIXELS = 36;
const DRAG_SCROLL_STEP_PIXELS = 18;
const DRAG_PREVIEW_OFFSET_PIXELS = 14;
const LayerActionSymbol = {
	Locked: '🔒',
	Unlocked: '🔓',
	Edit: '✎',
	Delete: '×',
	Forward: '↑',
	Backward: '↓',
	Drag: '⠿',
} as const;
const ObjectTypeLabel: Readonly<Record<AnnotationObject['type'], string>> = {
	[AnnotationObjectTypeId.Arrow]: 'Arrow',
	[AnnotationObjectTypeId.Step]: 'Number marker',
	[AnnotationObjectTypeId.Box]: 'Box',
	[AnnotationObjectTypeId.Highlight]: 'Highlight',
	[AnnotationObjectTypeId.Text]: 'Text',
	[AnnotationObjectTypeId.Blur]: 'Blur',
	[AnnotationObjectTypeId.Redact]: 'Redaction',
	[AnnotationObjectTypeId.Shape]: 'Shape',
	[AnnotationObjectTypeId.Stroke]: 'Stroke',
	[AnnotationObjectTypeId.Fill]: 'Fill',
};

export class LayersController {
	readonly #editListeners = new Set<(objectId: string) => void>();
	#draggedObjectId: string | null = null;
	#dragPointerId: number | null = null;
	#dragPreview: HTMLElement | null = null;
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects?: AnnotationDocument,
		readonly panel = new LayersPanel(),
	) {
		documentModel.layers.onChange((state) =>
			this.render(state.layers, state.activeLayerId),
		);
		objects?.onChange((_state, change) => {
			if (isEphemeralAnnotationChange(change)) return;
			const state = documentModel.layers.state;
			this.render(state.layers, state.activeLayerId);
		});
	}

	onEditRequested(listener: (objectId: string) => void): void {
		this.#editListeners.add(listener);
	}

	private render(layers: readonly EditorLayer[], activeLayerId: string): void {
		const rows: HTMLElement[] = [];
		for (const layer of [...layers].reverse()) {
			if (layer.kind === LayerKind.Objects && this.objects) {
				rows.push(
					...([...this.objects.state.objects]
						.reverse()
						.map((object, index) =>
							this.createObjectRow(object, index),
						) satisfies HTMLElement[]),
				);
				continue;
			}
			rows.push(this.createLayerRow(layer, layer.id === activeLayerId));
		}
		this.panel.list.replaceChildren(...rows);
	}

	private createLayerRow(layer: EditorLayer, selected: boolean): HTMLElement {
		const row = document.createElement('div');
		row.className = 'layer-row';
		row.dataset.layerId = layer.id;
		this.bindSelectableRow(row, selected, () =>
			this.documentModel.layers.select(layer.id),
		);

		const visibility = document.createElement('button');
		visibility.type = 'button';
		visibility.className = 'layer-visibility';
		visibility.textContent = layer.visible
			? VisibilitySymbol.Visible
			: VisibilitySymbol.Hidden;
		visibility.title = `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`;
		visibility.setAttribute('aria-label', visibility.title);
		visibility.addEventListener('click', () =>
			this.documentModel.layers.setVisible(layer.id, !layer.visible),
		);

		const name = document.createElement('button');
		name.type = 'button';
		name.className = 'layer-name';
		name.textContent = layer.name;
		name.addEventListener('click', () =>
			this.documentModel.layers.select(layer.id),
		);
		const lock = this.actionButton(
			layer.locked ? LayerActionSymbol.Locked : LayerActionSymbol.Unlocked,
			`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`,
			() => this.documentModel.layers.setLocked(layer.id, !layer.locked),
		);
		lock.className = 'layer-lock';
		const edit = this.actionButton(LayerActionSymbol.Edit, `Edit ${layer.name}`, () =>
			this.documentModel.layers.select(layer.id),
		);
		edit.className = 'layer-edit';
		row.append(visibility, name, lock, edit);
		return row;
	}

	private createObjectRow(object: AnnotationObject, index: number): HTMLElement {
		const row = document.createElement('div');
		row.className = 'layer-row layer-object-row';
		row.dataset.objectId = object.id;
		row.classList.toggle(DRAG_SOURCE_CLASS, this.#draggedObjectId === object.id);
		this.bindSelectableRow(
			row,
			this.objects?.selectedId === object.id,
			() => this.editObject(object),
		);
		const label = `${ObjectTypeLabel[object.type]} ${index + 1}`;
		const dragHandle = this.dragHandle(row, object.id, label);
		const visibility = this.actionButton(
			object.visible === false ? VisibilitySymbol.Hidden : VisibilitySymbol.Visible,
			`${object.visible === false ? 'Show' : 'Hide'} ${label}`,
			() => this.objects?.setVisible(object.id, object.visible === false),
		);
		visibility.className = 'layer-visibility';
		const name = this.actionButton(label, `Select ${label}`, () =>
			this.editObject(object),
		);
		name.className = 'layer-name';
		const lock = this.actionButton(
			object.locked ? LayerActionSymbol.Locked : LayerActionSymbol.Unlocked,
			`${object.locked ? 'Unlock' : 'Lock'} ${label}`,
			() => this.objects?.setLocked(object.id, !object.locked),
		);
		lock.className = 'layer-lock';
		const edit = this.actionButton(LayerActionSymbol.Edit, `Edit ${label}`, () =>
			this.editObject(object),
		);
		edit.className = 'layer-edit';
		edit.disabled = object.locked === true || object.visible === false;
		const remove = this.actionButton(
			LayerActionSymbol.Delete,
			`Delete ${label}`,
			() => this.objects?.remove(object.id),
		);
		remove.className = 'layer-delete';
		const moveForward = this.actionButton(
			LayerActionSymbol.Forward,
			`Move ${label} forward`,
			() => this.objects?.reorder(object.id, AnnotationStackDirection.Forward),
		);
		moveForward.className = 'layer-forward';
		moveForward.disabled = index === 0;
		const objectCount = this.objects?.state.objects.length ?? 0;
		const moveBackward = this.actionButton(
			LayerActionSymbol.Backward,
			`Move ${label} backward`,
			() => this.objects?.reorder(object.id, AnnotationStackDirection.Backward),
		);
		moveBackward.className = 'layer-backward';
		moveBackward.disabled = index === objectCount - 1;
		row.append(
			dragHandle,
			visibility,
			name,
			moveForward,
			moveBackward,
			lock,
			edit,
			remove,
		);
		return row;
	}

	private dragHandle(
		row: HTMLElement,
		objectId: string,
		label: string,
	): HTMLButtonElement {
		const handle = this.actionButton(
			LayerActionSymbol.Drag,
			`Drag ${label} to reorder`,
			() => undefined,
		);
		handle.className = 'layer-drag-handle';
		handle.dataset.dragObjectId = objectId;
		handle.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.#draggedObjectId = objectId;
			this.#dragPointerId = event.pointerId;
			handle.setPointerCapture(event.pointerId);
			handle.classList.add('dragging');
			row.classList.add(DRAG_SOURCE_CLASS);
			this.#dragPreview = this.createDragPreview(label);
			this.moveDragPreview(event.clientX, event.clientY);
		});
		handle.addEventListener('pointermove', (event) => {
			if (event.pointerId !== this.#dragPointerId) return;
			this.moveDragPreview(event.clientX, event.clientY);
			this.autoScroll(event.clientY);
			this.showDropTarget(event.clientX, event.clientY);
		});
		handle.addEventListener('pointerup', (event) => {
			if (event.pointerId !== this.#dragPointerId) return;
			const targetId = this.dropTargetId(event.clientX, event.clientY);
			const draggedId = this.#draggedObjectId;
			this.finishDragging();
			if (draggedId && targetId) this.objects?.moveToObject(draggedId, targetId);
		});
		handle.addEventListener('pointercancel', () => this.finishDragging());
		return handle;
	}

	private showDropTarget(clientX: number, clientY: number): void {
		this.clearDropTargets();
		const row = this.objectRowAtPoint(clientX, clientY);
		if (row?.dataset.objectId !== this.#draggedObjectId)
			row?.classList.add(DRAG_TARGET_CLASS);
	}

	private dropTargetId(clientX: number, clientY: number): string | null {
		return this.objectRowAtPoint(clientX, clientY)?.dataset.objectId ?? null;
	}

	private objectRowAtPoint(clientX: number, clientY: number): HTMLElement | null {
		const hitRow = document
			.elementFromPoint(clientX, clientY)
			?.closest<HTMLElement>('.layer-object-row');
		if (hitRow) return hitRow;
		return (
			Array.from(
				this.panel.list.querySelectorAll<HTMLElement>('.layer-object-row'),
			).find((row) => {
				const bounds = row.getBoundingClientRect();
				return (
					clientX >= bounds.left &&
					clientX <= bounds.right &&
					clientY >= bounds.top &&
					clientY <= bounds.bottom
				);
			}) ?? null
		);
	}

	private autoScroll(clientY: number): void {
		const bounds = this.panel.element.getBoundingClientRect();
		if (clientY < bounds.top + DRAG_SCROLL_EDGE_PIXELS)
			this.panel.element.scrollTop -= DRAG_SCROLL_STEP_PIXELS;
		else if (clientY > bounds.bottom - DRAG_SCROLL_EDGE_PIXELS)
			this.panel.element.scrollTop += DRAG_SCROLL_STEP_PIXELS;
	}

	private createDragPreview(label: string): HTMLElement {
		const preview = document.createElement('div');
		preview.className = DRAG_PREVIEW_CLASS;
		preview.textContent = `Moving ${label}`;
		document.body.append(preview);
		return preview;
	}

	private moveDragPreview(clientX: number, clientY: number): void {
		if (!this.#dragPreview) return;
		this.#dragPreview.style.transform = `translate(${clientX + DRAG_PREVIEW_OFFSET_PIXELS}px, ${clientY + DRAG_PREVIEW_OFFSET_PIXELS}px)`;
	}

	private finishDragging(): void {
		this.#draggedObjectId = null;
		this.#dragPointerId = null;
		this.panel.list
			.querySelectorAll('.layer-drag-handle.dragging')
			.forEach((handle) => handle.classList.remove('dragging'));
		this.panel.list
			.querySelectorAll(`.${DRAG_SOURCE_CLASS}`)
			.forEach((row) => row.classList.remove(DRAG_SOURCE_CLASS));
		this.#dragPreview?.remove();
		this.#dragPreview = null;
		this.clearDropTargets();
	}

	private clearDropTargets(): void {
		this.panel.list
			.querySelectorAll(`.${DRAG_TARGET_CLASS}`)
			.forEach((row) => row.classList.remove(DRAG_TARGET_CLASS));
	}

	private editObject(object: AnnotationObject): void {
		if (!this.objects?.isEditable(object.id)) return;
		this.documentModel.layers.select(CoreLayerId.Objects);
		this.objects.select(object.id);
		this.#editListeners.forEach((listener) => listener(object.id));
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
			if (event.key !== 'Enter' && event.key !== ' ') return;
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
