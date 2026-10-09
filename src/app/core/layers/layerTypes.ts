export const LayerKind = {
	Raster: 'raster',
	Objects: 'objects',
} as const;
export type LayerKind = (typeof LayerKind)[keyof typeof LayerKind];

export const CoreLayerId = {
	Image: 'image',
	Objects: 'objects',
} as const;
export type CoreLayerId = (typeof CoreLayerId)[keyof typeof CoreLayerId];

interface LayerBase {
	readonly id: string;
	readonly name: string;
	readonly visible: boolean;
	readonly locked: boolean;
}

export interface RasterLayer extends LayerBase {
	readonly kind: typeof LayerKind.Raster;
}

export interface ObjectLayer extends LayerBase {
	readonly kind: typeof LayerKind.Objects;
}

export type EditorLayer = RasterLayer | ObjectLayer;

export interface LayerState {
	readonly activeLayerId: string;
	readonly layers: readonly EditorLayer[];
}

export const DEFAULT_LAYER_STATE: LayerState = {
	activeLayerId: CoreLayerId.Image,
	layers: [
		{
			id: CoreLayerId.Image,
			kind: LayerKind.Raster,
			name: 'Image',
			visible: true,
			locked: false,
		},
		{
			id: CoreLayerId.Objects,
			kind: LayerKind.Objects,
			name: 'Editable objects',
			visible: true,
			locked: false,
		},
	],
};

/** Layer blend modes, named as canvas composite operations. */
export const BlendMode = {
	Normal: 'normal',
	Multiply: 'multiply',
	Screen: 'screen',
	Overlay: 'overlay',
	Darken: 'darken',
	Lighten: 'lighten',
	ColorDodge: 'color-dodge',
	ColorBurn: 'color-burn',
	HardLight: 'hard-light',
	SoftLight: 'soft-light',
	Difference: 'difference',
	Exclusion: 'exclusion',
	Hue: 'hue',
	Saturation: 'saturation',
	Color: 'color',
	Luminosity: 'luminosity',
} as const;
export type BlendMode = (typeof BlendMode)[keyof typeof BlendMode];

export const BLEND_MODE_LABELS: Readonly<Record<BlendMode, string>> = {
	[BlendMode.Normal]: 'Normal',
	[BlendMode.Multiply]: 'Multiply',
	[BlendMode.Screen]: 'Screen',
	[BlendMode.Overlay]: 'Overlay',
	[BlendMode.Darken]: 'Darken',
	[BlendMode.Lighten]: 'Lighten',
	[BlendMode.ColorDodge]: 'Color dodge',
	[BlendMode.ColorBurn]: 'Color burn',
	[BlendMode.HardLight]: 'Hard light',
	[BlendMode.SoftLight]: 'Soft light',
	[BlendMode.Difference]: 'Difference',
	[BlendMode.Exclusion]: 'Exclusion',
	[BlendMode.Hue]: 'Hue',
	[BlendMode.Saturation]: 'Saturation',
	[BlendMode.Color]: 'Color',
	[BlendMode.Luminosity]: 'Luminosity',
};

export const LayerOpacity = { Transparent: 0, Opaque: 1 } as const;

/** How a layer is named and composited over the layers beneath it. */
export interface LayerAppearance {
	readonly name: string;
	readonly opacity: number;
	readonly blendMode: BlendMode;
}

export type LayerAppearanceChange = Partial<LayerAppearance>;

export function isBlendMode(value: unknown): value is BlendMode {
	return Object.values(BlendMode).some((mode) => mode === value);
}

export function isLayerOpacity(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isFinite(value) &&
		value >= LayerOpacity.Transparent &&
		value <= LayerOpacity.Opaque
	);
}
