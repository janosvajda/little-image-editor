import type { ImageFormat } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { imageFormat } from '../../core/document/imageFormats';
import { canvasContext } from '../../shared/dom/domHelpers';
import { MAX_CANVAS_DIMENSION } from '../../core/geometry/geometryHelpers';

const PIXEL_CHANNEL_COUNT = 4;
const ALPHA_CHANNEL_OFFSET = 3;
const OPAQUE_ALPHA = 255;

export const CanvasCopyMode = {
	Bitmap: 'bitmap',
	Pixels: 'pixels',
} as const;
export type CanvasCopyMode =
	(typeof CanvasCopyMode)[keyof typeof CanvasCopyMode];

export function copyCanvas(
	source: HTMLCanvasElement,
	mode: CanvasCopyMode = CanvasCopyMode.Bitmap,
): HTMLCanvasElement {
	const copy = document.createElement('canvas');
	copy.width = source.width;
	copy.height = source.height;
	const context = canvasContext(copy);
	if (mode === CanvasCopyMode.Pixels)
		context.putImageData(
			canvasContext(source).getImageData(0, 0, source.width, source.height),
			0,
			0,
		);
	else context.drawImage(source, 0, 0);
	return copy;
}

export function hasTransparency(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
): boolean {
	const pixels = context.getImageData(0, 0, width, height).data;
	for (
		let index = ALPHA_CHANNEL_OFFSET;
		index < pixels.length;
		index += PIXEL_CHANNEL_COUNT
	) {
		if (pixels[index]! < OPAQUE_ALPHA) return true;
	}
	return false;
}

/**
 * How an image is written: its size as a share of the original, the quality
 * a lossy format compresses to, and a colour shown behind transparent pixels.
 * A format without transparency is written over white when none is given.
 */
export interface ImageEncoding {
	readonly scale?: number;
	/** From 0 to 1, for JPEG and WebP. */
	readonly quality?: number;
	readonly background?: string;
}

/** The size of an image written at a scale: whole pixels, at least one, and no larger than a canvas can be. */
export function encodedSize(width: number, height: number, scale = 1): { width: number; height: number } {
	const fit = Math.min(scale, MAX_CANVAS_DIMENSION / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * fit)), height: Math.max(1, Math.round(height * fit)) };
}

export function encodeCanvas(
	source: HTMLCanvasElement,
	type: ImageFormat,
	encoding: ImageEncoding = {},
): Promise<Blob> {
	const format = imageFormat(type);
	const output = document.createElement('canvas');
	const size = encodedSize(source.width, source.height, encoding.scale);
	output.width = size.width;
	output.height = size.height;
	const context = canvasContext(output);
	const background = encoding.background ?? (format.supportsTransparency ? undefined : ColorPalette.White);
	if (background !== undefined) {
		context.fillStyle = background;
		context.fillRect(0, 0, output.width, output.height);
	}
	context.imageSmoothingQuality = SMOOTHING_QUALITY;
	context.drawImage(source, 0, 0, output.width, output.height);
	return new Promise((resolve, reject) => {
		output.toBlob(
			(blob) =>
				blob ? resolve(blob) : reject(new Error('Image encoding failed')),
			format.mimeType,
			encoding.quality ?? format.quality,
		);
	});
}

/** A resized copy is smoothed as finely as the browser can. */
const SMOOTHING_QUALITY: ImageSmoothingQuality = 'high';
