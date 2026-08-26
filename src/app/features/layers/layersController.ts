import type { CanvasDocument } from '../../core/document/imageDocument';
import {
	CoreLayerId,
	LayerKind,
	type EditorLayer,
} from '../../core/layers/layerTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationChangeKind } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
} from '../annotations/annotationTypes';
import { LayersPanel } from './layersPanel';

const VisibilitySymbol = { Visible: '◉', Hidden: '○' } as const;
const LayerActionSymbol = {
	Locked: '🔒',
	Unlocked: '🔓',
	Edit: '✎',
	Delete: '×',
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
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects?: AnnotationDocument,
		readonly panel = new LayersPanel(),
	) {
		documentModel.layers.onChange((state) =>
			this.render(state.layers, state.activeLayerId),
		);
		objects?.onChange((_state, change) => {
			if (change === AnnotationChangeKind.Transient) return;
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
			rows.push(this.createLayerRow(layer, layer.id === activeLayerId));
			if (layer.kind === LayerKind.Objects && this.objects)
				rows.push(
					...([...this.objects.state.objects]
						.reverse()
						.map((object, index) =>
							this.createObjectRow(object, index),
						) satisfies HTMLElement[]),
				);
		}
		this.panel.list.replaceChildren(...rows);
	}

	private createLayerRow(layer: EditorLayer, selected: boolean): HTMLElement {
		const row = document.createElement('div');
		row.className = 'layer-row';
		row.dataset.layerId = layer.id;
		row.role = 'option';
		row.setAttribute('aria-selected', String(selected));
		row.classList.toggle('active', selected);

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
		row.classList.toggle('active', this.objects?.selectedId === object.id);
		const label = `${ObjectTypeLabel[object.type]} ${index + 1}`;
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
		row.append(visibility, name, lock, edit, remove);
		return row;
	}

	private editObject(object: AnnotationObject): void {
		if (!this.objects?.isEditable(object.id)) return;
		this.documentModel.layers.select(CoreLayerId.Objects);
		this.objects.select(object.id);
		this.#editListeners.forEach((listener) => listener(object.id));
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
