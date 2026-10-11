import { ImageMimeType } from '../../core/document/appTypes';
import { imageFormat } from '../../core/document/imageFormats';
import type { ImageEncoding } from './canvasHelpers';
import type { SvgDocumentOptions } from './svgExport';

/**
 * How an export is written, as chosen in the Export dialog: its size, and the
 * settings its format has. Image formats use the encoding; SVG, its own.
 */
export interface ExportOptions extends ImageEncoding, SvgDocumentOptions {
	readonly scale: number;
}

/** The sizes an export can be written at, as shares of the image's own. */
export const ExportScale = { Quarter: 0.25, Half: 0.5, ThreeQuarters: 0.75, Original: 1, OneAndAHalf: 1.5, Double: 2, Triple: 3 } as const;
export const EXPORT_SCALES: readonly number[] = Object.values(ExportScale);

/** Quality, as a percentage where it is chosen. */
export const ExportQualityPercent = { Minimum: 10, Maximum: 100 } as const;
export const PERCENT = 100;

/** The quality a lossy export starts at: the editor's own default for its format. */
export const DEFAULT_EXPORT_QUALITY = imageFormat(ImageMimeType.Jpeg).quality ?? 1;
