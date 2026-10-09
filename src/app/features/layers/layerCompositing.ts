import { BlendMode } from '../../core/layers/layerTypes';
import type {
	AnnotationObject,
	AnnotationState,
	ContentLayer,
} from '../annotations/annotationTypes';
import { hasDefaultCompositing, layerAppearance } from './layerAppearance';

const NORMAL_COMPOSITE_OPERATION: GlobalCompositeOperation = 'source-over';

const layerSurface = document.createElement('canvas');
const layerSurfaceContext = layerSurface.getContext('2d');

/**
 * Draws one layer's content with its opacity and blend mode. Default layers
 * are drawn directly; others are isolated first, so their own overlapping
 * items are flattened before they are blended with the layers beneath.
 * `null` draws with default compositing.
 */
export function compositeLayer(
	target: CanvasRenderingContext2D,
	layer: ContentLayer | null,
	draw: (context: CanvasRenderingContext2D) => void,
): void {
	if (!layer || hasDefaultCompositing(layer) || !layerSurfaceContext) {
		draw(target);
		return;
	}
	const { width, height } = target.canvas;
	if (layerSurface.width !== width || layerSurface.height !== height) {
		layerSurface.width = width;
		layerSurface.height = height;
	}
	layerSurfaceContext.clearRect(0, 0, width, height);
	draw(layerSurfaceContext);
	const appearance = layerAppearance(layer);
	target.save();
	target.globalAlpha *= appearance.opacity;
	target.globalCompositeOperation = compositeOperation(appearance.blendMode);
	target.drawImage(layerSurface, 0, 0);
	target.restore();
}

const includeEveryItem = (): boolean => true;

/**
 * Draws every visible layer bottom first, each as one composited group of its
 * visible items. `include` limits drawing to some items, for partial caches.
 */
export function compositeLayers(
	target: CanvasRenderingContext2D,
	state: Readonly<AnnotationState>,
	drawItem: (context: CanvasRenderingContext2D, item: AnnotationObject) => void,
	include: (item: AnnotationObject) => boolean = includeEveryItem,
): void {
	let cursor = 0;
	for (const layer of state.layers) {
		// `objects` follows `layers`, so each layer's items are the next run of objects.
		const items = state.objects.slice(cursor, cursor + layer.itemIds.length);
		cursor += layer.itemIds.length;
		if (layer.visible === false) continue;
		const shown = items.filter(
			(item) => item.visible !== false && include(item),
		);
		if (shown.length === 0) continue;
		compositeLayer(target, layer, (context) => {
			for (const item of shown) drawItem(context, item);
		});
	}
}

/** The layer holding an item in a state, for drawing one item on its own. */
export function layerHolding(
	state: Readonly<AnnotationState>,
	itemId: string,
): ContentLayer | null {
	return state.layers.find((layer) => layer.itemIds.includes(itemId)) ?? null;
}

/** Blend modes other than Normal need the image beneath them to blend against. */
export function requiresImageBackdrop(
	layers: readonly ContentLayer[],
): boolean {
	return layers.some(
		(layer) =>
			layer.visible !== false &&
			layer.itemIds.length > 0 &&
			layerAppearance(layer).blendMode !== BlendMode.Normal,
	);
}

export function compositeOperation(mode: BlendMode): GlobalCompositeOperation {
	return mode === BlendMode.Normal ? NORMAL_COMPOSITE_OPERATION : mode;
}
