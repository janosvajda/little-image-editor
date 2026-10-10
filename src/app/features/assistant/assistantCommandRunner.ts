import { ShapeToolId } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { normalizedRect, rectOrientation } from '../../core/geometry/geometryHelpers';
import type { EditorHistory } from '../../core/history/editorHistory';
import { type AnnotationDocument, annotationBounds } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type ContentLayer,
} from '../annotations/annotationTypes';
import {
	type AssistantCommand,
	AssistantCommandKind,
	type AssistantResult,
	type DescribedItem,
	type DocumentDescription,
} from './assistantCommandTypes';

const NO_IMAGE_MESSAGE = 'No image is open in the editor; create or open one first.';
const NO_ITEM_LAYER_MESSAGE = 'The item was not added to a layer.';

/**
 * Carries out an assistant's commands on the open document, through the
 * same layer and item model as the editor's tools: each change is one undo
 * step, lands in the layers panel and saves with the document.
 */
export class AssistantCommandRunner {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
		private readonly history: Pick<EditorHistory, 'undo' | 'canUndo'>,
	) {}

	run(command: AssistantCommand): AssistantResult {
		if (!this.documentModel.hasImage) throw new Error(NO_IMAGE_MESSAGE);
		switch (command.kind) {
			case AssistantCommandKind.Describe:
				return { document: this.describe() };
			case AssistantCommandKind.AddLayer: {
				const layerId = this.objects.createLayer();
				if (command.name) this.objects.setLayerAppearance(layerId, { name: command.name });
				return { layerId, layerName: this.objects.layerName(layerId) };
			}
			case AssistantCommandKind.AddShape:
				return this.addItem(command.layer, {
					id: crypto.randomUUID(),
					type: AnnotationObjectTypeId.Shape,
					shape: command.shape,
					rect: command.rect,
					rotation: command.rotation,
					color: command.color,
					width: command.strokeWidth,
					opacity: command.opacity,
					fill: command.fill,
				});
			case AssistantCommandKind.AddLine:
				return this.addItem(command.layer, {
					id: crypto.randomUUID(),
					type: AnnotationObjectTypeId.Shape,
					shape: command.arrow ? ShapeToolId.Arrow : ShapeToolId.Line,
					rect: normalizedRect(command.from, command.to),
					...rectOrientation(command.from, command.to),
					rotation: 0,
					color: command.color,
					width: command.width,
					opacity: command.opacity,
					fill: false,
				});
			case AssistantCommandKind.AddText:
				return this.addItem(command.layer, {
					id: crypto.randomUUID(),
					type: AnnotationObjectTypeId.Text,
					at: command.at,
					text: command.text,
					color: command.color,
					size: command.size,
				});
			case AssistantCommandKind.RemoveItem: {
				const item = this.objects.object(command.item);
				if (!item) throw new Error(`No item has the id ${command.item}.`);
				this.objects.remove(item.id);
				return { removed: item.id };
			}
			case AssistantCommandKind.Undo: {
				const undone = this.history.canUndo;
				this.history.undo();
				return { undone };
			}
		}
	}

	/** Adds an item on top of a layer, or of the active layer, without leaving it selected. */
	private addItem(layerName: string | undefined, item: AnnotationObject): AssistantResult {
		if (layerName !== undefined) {
			const layer = this.findLayer(layerName);
			if (!this.objects.isLayerEditable(layer.id))
				throw new Error(`The layer "${layer.name}" is locked or hidden; unlock and show it first.`);
			this.objects.activate(layer.id);
		}
		this.objects.add(item);
		this.objects.clearSelection();
		const layer = this.objects.layerOf(item.id);
		if (!layer) throw new Error(NO_ITEM_LAYER_MESSAGE);
		return { itemId: item.id, layerId: layer.id, layerName: layer.name };
	}

	/** A layer by id, or by name, ignoring case. */
	private findLayer(idOrName: string): ContentLayer {
		const layers = this.objects.state.layers;
		const wanted = idOrName.toLowerCase();
		const layer =
			layers.find(({ id }) => id === idOrName) ??
			layers.find(({ name }) => name.toLowerCase() === wanted);
		if (layer) return layer;
		const names = layers.map(({ name }) => `"${name}"`).join(', ') || 'none yet';
		throw new Error(`No layer is called "${idOrName}". The layers are: ${names}.`);
	}

	private describe(): DocumentDescription {
		const active = this.objects.activeLayer?.id;
		return {
			name: this.documentModel.baseName,
			width: this.documentModel.width,
			height: this.documentModel.height,
			layers: this.objects.state.layers.map((layer) => ({
				id: layer.id,
				name: layer.name,
				visible: layer.visible !== false,
				locked: layer.locked === true,
				active: layer.id === active,
				items: this.objects.layerItems(layer.id).map(describeItem),
			})),
		};
	}
}

function describeItem(item: AnnotationObject): DescribedItem {
	return {
		id: item.id,
		type: item.type,
		...(item.type === AnnotationObjectTypeId.Shape ? { shape: item.shape } : {}),
		...(item.type === AnnotationObjectTypeId.Text ? { text: item.text } : {}),
		...('color' in item ? { color: item.color } : {}),
		bounds: annotationBounds(item),
	};
}
