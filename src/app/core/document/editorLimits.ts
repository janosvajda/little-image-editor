export const EditorLimit = {
	EditableObjectWarning: 500,
	EditableObjectImportMaximum: 10_000,
	EditableObjectHistory: 50,
	RasterHistory: 30,
} as const;

export const DocumentLimitStateKey = {
	PerformanceWarning: 'documentPerformanceWarning',
} as const;

export interface DocumentPerformanceWarningState {
	readonly suppressEditableObjectWarning: boolean;
}
