import { LineEnd } from '../annotations/lineEnd';
import { ShapeToolId } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { normalizedRect, rectOrientation } from '../../core/geometry/geometryHelpers';
import type { EditorHistory } from '../../core/history/editorHistory';
import { type AnnotationDocument, annotationBounds } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type ContentLayer,
	LineDash,
} from '../annotations/annotationTypes';
import {
	type AssistantCommand,
	AssistantCommandKind,
	type AssistantResult,
	type DescribedItem,
	type DocumentDescription,
	type DrawingCommand,
	SHORT_ID_LENGTH,
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
			case AssistantCommandKind.RemoveItem: {
				const item = this.findItem(command.item);
				this.objects.remove(item.id);
				return { removed: item.id };
			}
			case AssistantCommandKind.Undo: {
				const undone = this.history.canUndo;
				this.history.undo();
				return { undone };
			}
			case AssistantCommandKind.Batch:
				return { batch: this.runBatch(command.commands) };
			default:
				return this.draw(command);
		}
	}

	/** Runs drawing commands as one undo step; when one fails, none of them stays. */
	private runBatch(commands: readonly DrawingCommand[]): { layers: string[]; items: number } {
		const layers: string[] = [];
		let items = 0;
		this.objects.transact(() => {
			commands.forEach((command, index) => {
				try {
					const result = this.draw(command);
					if ('itemId' in result) items++;
					else if ('layerId' in result) layers.push(result.layerName);
				} catch (error) {
					throw new Error(`Step ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
				}
			});
		});
		return { layers, items };
	}

	/** A straight, solid line stays a line shape; bends, dashes or named ends make one connector. */
	private addLine(command: Extract<DrawingCommand, { kind: typeof AssistantCommandKind.AddLine }>): AssistantResult {
		if (command.via?.length || command.dashed || command.head || command.tail)
			return this.addItem(command.layer, {
				id: crypto.randomUUID(),
				type: AnnotationObjectTypeId.Connector,
				points: [command.from, ...(command.via ?? []), command.to],
				color: command.color,
				width: command.width,
				opacity: command.opacity,
				arrow: command.head ? command.head !== LineEnd.None : command.arrow,
				dash: command.dashed ? LineDash.Dashed : LineDash.Solid,
				...(command.head ? { head: command.head } : {}),
				...(command.tail ? { tail: command.tail } : {}),
			});
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
	}

	private draw(command: DrawingCommand): AssistantResult {
		switch (command.kind) {
			case AssistantCommandKind.AddLayer: {
				let layerId = '';
				// Creating and naming the layer is one step, so one undo removes it.
				this.objects.transact(() => {
					layerId = this.objects.createLayer();
					if (command.name) this.objects.setLayerAppearance(layerId, { name: command.name });
				});
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
					...(command.fill && command.fillColor ? { fillColor: command.fillColor } : {}),
				});
			case AssistantCommandKind.AddLine:
				return this.addLine(command);
			case AssistantCommandKind.AddText:
				return this.addItem(command.layer, {
					id: crypto.randomUUID(),
					type: AnnotationObjectTypeId.Text,
					at: command.at,
					text: command.text,
					color: command.color,
					size: command.size,
				});
		}
	}

	/** An item by its id, or by the start of it as assistants are shown. */
	private findItem(reference: string): AnnotationObject {
		const exact = this.objects.object(reference);
		if (exact) return exact;
		const matches =
			reference.length >= SHORT_ID_LENGTH ? this.objects.state.objects.filter(({ id }) => id.startsWith(reference)) : [];
		if (matches.length === 1) return matches[0]!;
		throw new Error(
			matches.length ? `Several items start with ${reference}; give more of the id.` : `No item has the id ${reference}.`,
		);
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
		const startsWith = layers.filter(({ id }) => id.startsWith(idOrName));
		const layer =
			layers.find(({ id }) => id === idOrName) ??
			layers.find(({ name }) => name.toLowerCase() === wanted) ??
			(idOrName.length >= SHORT_ID_LENGTH && startsWith.length === 1 ? startsWith[0] : undefined);
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
