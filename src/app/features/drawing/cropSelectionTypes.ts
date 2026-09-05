export const CropSelectionKind = {
	Rectangle: 'rectangle',
	Lasso: 'lasso',
} as const;
export type CropSelectionKind =
	(typeof CropSelectionKind)[keyof typeof CropSelectionKind];
