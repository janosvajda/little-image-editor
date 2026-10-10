import {
	BlendMode,
	type LayerAppearance,
	type LayerAppearanceChange,
	LayerOpacity,
} from '../../core/layers/layerTypes';
import type { ContentLayer } from '../annotations/annotationTypes';

/** New layers are called "<prefix> <n>"; a layer's number is assigned once and never shifts. */
export const LAYER_NAME_PREFIX = 'Layer';
const LAYER_NAME_SEPARATOR = ' ';
const DUPLICATE_NAME_SUFFIX = ' copy';
const FIRST_LAYER_NUMBER = 1;

export function layerAppearance(layer: ContentLayer): LayerAppearance {
	return {
		name: layer.name,
		opacity: layer.opacity ?? LayerOpacity.Opaque,
		blendMode: layer.blendMode ?? BlendMode.Normal,
	};
}

/** Composites like a plain draw, so rendering can skip an intermediate surface. */
export function hasDefaultCompositing(layer: ContentLayer): boolean {
	const { opacity, blendMode } = layerAppearance(layer);
	return opacity === LayerOpacity.Opaque && blendMode === BlendMode.Normal;
}

export function applyLayerAppearance(
	layer: ContentLayer,
	change: LayerAppearanceChange,
): void {
	if (change.name !== undefined) layer.name = change.name;
	if (change.opacity !== undefined) layer.opacity = change.opacity;
	if (change.blendMode !== undefined) layer.blendMode = change.blendMode;
}

/**
 * Hands out "Layer <n>" names above the highest number seen, so a number
 * freed by a deleted layer is never handed out again.
 */
export class LayerNumbering {
	#highest = 0;

	constructor(existingNames: Iterable<string>) {
		this.observe(existingNames);
	}

	/** Accounts for names given elsewhere, such as by renaming or restoring. */
	observe(names: Iterable<string>): void {
		for (const name of names) {
			const separator = name.lastIndexOf(LAYER_NAME_SEPARATOR);
			const number = Number(name.slice(separator + 1));
			if (
				name.slice(0, separator) === LAYER_NAME_PREFIX &&
				Number.isSafeInteger(number) &&
				number >= FIRST_LAYER_NUMBER
			)
				this.#highest = Math.max(this.#highest, number);
		}
	}

	next(): string {
		this.#highest += 1;
		return `${LAYER_NAME_PREFIX}${LAYER_NAME_SEPARATOR}${this.#highest}`;
	}
}

export function duplicateLayerName(name: string): string {
	return `${name}${DUPLICATE_NAME_SUFFIX}`;
}
