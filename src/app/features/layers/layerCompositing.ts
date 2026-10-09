import { BlendMode } from '../../core/layers/layerTypes';
import type { AnnotationObject } from '../annotations/annotationTypes';
import { hasDefaultCompositing, layerAppearance } from './layerAppearance';

const NORMAL_COMPOSITE_OPERATION: GlobalCompositeOperation = 'source-over';

const layerSurface = document.createElement('canvas');
const layerSurfaceContext = layerSurface.getContext('2d');

/**
 * Draws one layer with its opacity and blend mode. Default layers are drawn
 * directly; others are isolated first, so their own overlapping content is
 * flattened before it is blended with the layers beneath it.
 */
export function compositeLayer(
	target: CanvasRenderingContext2D,
	object: AnnotationObject,
	draw: (context: CanvasRenderingContext2D) => void,
): void {
	if (hasDefaultCompositing(object) || !layerSurfaceContext) {
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
	const appearance = layerAppearance(object);
	target.save();
	target.globalAlpha *= appearance.opacity;
	target.globalCompositeOperation = compositeOperation(appearance.blendMode);
	target.drawImage(layerSurface, 0, 0);
	target.restore();
}

/** Blend modes other than Normal need the image beneath them to blend against. */
export function requiresImageBackdrop(
	objects: readonly AnnotationObject[],
): boolean {
	return objects.some(
		(object) =>
			object.visible !== false &&
			layerAppearance(object).blendMode !== BlendMode.Normal,
	);
}

export function compositeOperation(mode: BlendMode): GlobalCompositeOperation {
	return mode === BlendMode.Normal ? NORMAL_COMPOSITE_OPERATION : mode;
}
