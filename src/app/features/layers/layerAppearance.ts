import {
	BlendMode,
	type LayerAppearance,
	type LayerAppearanceChange,
	LayerOpacity,
} from '../../core/layers/layerTypes';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';

/** Default name prefixes; a layer's number is assigned once and never shifts. */
export const LayerNamePrefix: Readonly<Record<AnnotationObject['type'], string>> =
	{
		[AnnotationObjectTypeId.Arrow]: 'Arrow',
		[AnnotationObjectTypeId.Step]: 'Number marker',
		[AnnotationObjectTypeId.Box]: 'Box',
		[AnnotationObjectTypeId.Highlight]: 'Highlight',
		[AnnotationObjectTypeId.Text]: 'Text',
		[AnnotationObjectTypeId.Blur]: 'Blur',
		[AnnotationObjectTypeId.Redact]: 'Redaction',
		[AnnotationObjectTypeId.Shape]: 'Shape',
		[AnnotationObjectTypeId.Stroke]: 'Paint layer',
		[AnnotationObjectTypeId.Fill]: 'Fill',
		[AnnotationObjectTypeId.RasterFragment]: 'Raster fragment',
	};

const LAYER_NAME_SEPARATOR = ' ';
const DUPLICATE_NAME_SUFFIX = ' copy';
const FIRST_LAYER_NUMBER = 1;

export function layerAppearance(object: AnnotationObject): LayerAppearance {
	return {
		name: object.name ?? LayerNamePrefix[object.type],
		opacity: object.layerOpacity ?? LayerOpacity.Opaque,
		blendMode: object.blendMode ?? BlendMode.Normal,
	};
}

/** Composites like a plain draw, so rendering can skip an intermediate surface. */
export function hasDefaultCompositing(object: AnnotationObject): boolean {
	const { opacity, blendMode } = layerAppearance(object);
	return opacity === LayerOpacity.Opaque && blendMode === BlendMode.Normal;
}

export function applyLayerAppearance(
	object: AnnotationObject,
	change: LayerAppearanceChange,
): void {
	if (change.name !== undefined) object.name = change.name;
	if (change.opacity !== undefined) object.layerOpacity = change.opacity;
	if (change.blendMode !== undefined) object.blendMode = change.blendMode;
}

/** Hands out "<prefix> <n>" names above the highest number already in use. */
export class LayerNumbering {
	readonly #highest = new Map<string, number>();

	constructor(existingNames: Iterable<string>) {
		const prefixes = new Set(Object.values(LayerNamePrefix));
		for (const name of existingNames) {
			const separator = name.lastIndexOf(LAYER_NAME_SEPARATOR);
			const prefix = name.slice(0, separator);
			const number = Number(name.slice(separator + 1));
			if (
				separator > 0 &&
				prefixes.has(prefix) &&
				Number.isSafeInteger(number) &&
				number >= FIRST_LAYER_NUMBER
			)
				this.#highest.set(prefix, Math.max(this.#highest.get(prefix) ?? 0, number));
		}
	}

	next(type: AnnotationObject['type']): string {
		const prefix = LayerNamePrefix[type];
		const number = (this.#highest.get(prefix) ?? 0) + 1;
		this.#highest.set(prefix, number);
		return `${prefix}${LAYER_NAME_SEPARATOR}${number}`;
	}
}

export function duplicateLayerName(name: string): string {
	return `${name}${DUPLICATE_NAME_SUFFIX}`;
}

/**
 * Every layer's display name. Stored names win; layers without one (from older
 * data) are numbered bottom-up without colliding with stored names.
 */
export function resolveLayerNames(
	objects: readonly AnnotationObject[],
): ReadonlyMap<string, string> {
	const numbering = new LayerNumbering(
		objects.flatMap((object) => (object.name === undefined ? [] : [object.name])),
	);
	return new Map(
		objects.map((object) => [object.id, object.name ?? numbering.next(object.type)]),
	);
}
