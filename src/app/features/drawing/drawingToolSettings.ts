import type { LineEnds } from '../annotations/lineEnd';
import type { CropSelectionKind } from './cropSelectionTypes';
import type { StrokeOptions } from './drawingHelpers';
import type { FloodFillOptions } from './floodFillHelpers';
import type { ShapeStyle } from '../annotations/shapeStyle';
import type { ToolColorTarget } from './toolColorsControl';

/** The tool router depends on settings values, not toolbar DOM elements. */
export interface DrawingToolSettings {
	/** How shape tools draw: outline, fill, or both. */
	readonly shapeStyle: ShapeStyle;
	/** What shapes and paths are filled with, inside their line. */
	readonly fillColor: string;
	readonly cropSelectionKind: CropSelectionKind;
	strokeOptions(): StrokeOptions;
	/** The ends a drawn connector gets. */
	lineEnds(): LineEnds;
	fillOptions(): FloodFillOptions;
	/** Makes a picked colour the line or the fill colour. */
	pickColor(color: string, target: ToolColorTarget): void;
}
