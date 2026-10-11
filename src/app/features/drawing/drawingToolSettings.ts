import type { LineEnds } from '../annotations/lineEnd';
import type { CropSelectionKind } from './cropSelectionTypes';
import type { StrokeOptions } from './drawingHelpers';
import type { FloodFillOptions } from './floodFillHelpers';

/** The tool router depends on settings values, not toolbar DOM elements. */
export interface DrawingToolSettings {
	readonly fillShape: boolean;
	readonly cropSelectionKind: CropSelectionKind;
	strokeOptions(): StrokeOptions;
	/** The ends a drawn connector gets. */
	lineEnds(): LineEnds;
	fillOptions(): FloodFillOptions;
	showSampledColor(color: string): void;
}
