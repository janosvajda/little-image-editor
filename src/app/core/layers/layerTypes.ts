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
