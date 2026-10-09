export const EditorLimit = {
	EditableObjectWarning: 500,
	EditableObjectImportMaximum: 10_000,
	EditableObjectHistory: 50,
	RasterHistory: 30,
	/** Decoded raster layers kept ready for drawing; older ones are decoded again. */
	RasterLayerRenderCache: 64,
} as const;

export const DocumentLimitStateKey = {
	PerformanceWarning: 'documentPerformanceWarning',
} as const;

export interface DocumentPerformanceWarningState {
	readonly suppressEditableObjectWarning: boolean;
}
