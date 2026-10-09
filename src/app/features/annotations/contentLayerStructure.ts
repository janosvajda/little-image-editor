import { isBlendMode, isLayerOpacity } from '../../core/layers/layerTypes';
import { LayerNumbering } from '../layers/layerAppearance';
import type {
	AnnotationObject,
	AnnotationSessionState,
	AnnotationState,
	AnnotationStateInput,
	ContentLayer,
} from './annotationTypes';

/** Per-item layer fields from states that predate content layers. */
interface LooseItemLayerFields {
	name?: unknown;
	layerOpacity?: unknown;
	blendMode?: unknown;
}

export function emptyAnnotationState(): AnnotationState {
	return { objects: [], layers: [], nextStep: 1 };
}

export function emptyAnnotationSession(): AnnotationSessionState {
	return {
		state: emptyAnnotationState(),
		history: [emptyAnnotationState()],
		historyIndex: 0,
	};
}

/**
 * Completes a state so every item belongs to exactly one layer and `objects`
 * follows the layer order. Unknown or repeated item ids are dropped; an item
 * outside every layer gets a layer of its own, in its render position.
 */
export function normalizeAnnotationState(
	input: AnnotationStateInput,
): AnnotationState {
	const itemsById = new Map(input.objects.map((item) => [item.id, item]));
	const claimed = new Set<string>();
	const layers: ContentLayer[] = (input.layers ?? []).map((layer) => {
		const itemIds = layer.itemIds.filter(
			(id) => itemsById.has(id) && !claimed.has(id),
		);
		for (const id of itemIds) claimed.add(id);
		return { ...layer, itemIds };
	});
	const loose = input.objects.filter((item) => !claimed.has(item.id));
	if (loose.length > 0) {
		const numbering = new LayerNumbering(
			[...layers.map((layer) => layer.name), ...loose.flatMap(looseName)],
		);
		for (const looseItem of loose) {
			const { item, layer } = separateLooseItem(looseItem, numbering);
			itemsById.set(item.id, item);
			layers.push(layer);
		}
	}
	return {
		objects: itemsInLayerOrder(layers, itemsById),
		layers,
		nextStep: input.nextStep,
	};
}

/** The state itself when it has layers; otherwise a completed copy. */
export function withContentLayers(
	state: Readonly<AnnotationStateInput>,
): Readonly<AnnotationState> {
	return state.layers
		? (state as Readonly<AnnotationState>)
		: normalizeAnnotationState(structuredClone(state));
}

/** Every item, bottom layer first and each layer's items bottom first. */
export function itemsInLayerOrder(
	layers: readonly ContentLayer[],
	itemsById: ReadonlyMap<string, AnnotationObject>,
): AnnotationObject[] {
	return layers.flatMap((layer) =>
		layer.itemIds.flatMap((id) => {
			const item = itemsById.get(id);
			return item ? [item] : [];
		}),
	);
}

/** Gives a loose item its own layer, moving any per-item layer fields onto it. */
function separateLooseItem(
	looseItem: AnnotationObject,
	numbering: LayerNumbering,
): { item: AnnotationObject; layer: ContentLayer } {
	const { name, layerOpacity, blendMode, ...item } =
		looseItem as AnnotationObject & LooseItemLayerFields;
	return {
		item: item as AnnotationObject,
		layer: {
			id: crypto.randomUUID(),
			name: typeof name === 'string' && name.trim() ? name : numbering.next(),
			itemIds: [item.id],
			...(isLayerOpacity(layerOpacity) ? { opacity: layerOpacity } : {}),
			...(isBlendMode(blendMode) ? { blendMode } : {}),
		},
	};
}

function looseName(item: AnnotationObject): string[] {
	const { name } = item as AnnotationObject & LooseItemLayerFields;
	return typeof name === 'string' ? [name] : [];
}
