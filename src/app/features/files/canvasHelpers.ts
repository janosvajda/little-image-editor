import type { ImageFormat } from '../../core/document/appTypes';
import { imageFormat } from '../../core/document/imageFormats';
import { canvasContext } from '../../shared/dom/domHelpers';
import { ColorPalette } from '../../core/document/colorPalette';

const PIXEL_CHANNEL_COUNT = 4;
const ALPHA_CHANNEL_OFFSET = 3;
const OPAQUE_ALPHA = 255;

export function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
	const copy = document.createElement('canvas');
	copy.width = source.width;
	copy.height = source.height;
	canvasContext(copy).drawImage(source, 0, 0);
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

export function encodeCanvas(
	source: HTMLCanvasElement,
	type: ImageFormat,
): Promise<Blob> {
	const format = imageFormat(type);
	const output = document.createElement('canvas');
	output.width = source.width;
	output.height = source.height;
	const context = canvasContext(output);
	if (!format.supportsTransparency) {
		context.fillStyle = ColorPalette.White;
		context.fillRect(0, 0, output.width, output.height);
	}
	context.drawImage(source, 0, 0);
	return new Promise((resolve, reject) => {
		output.toBlob(
			(blob) =>
				blob ? resolve(blob) : reject(new Error('Image encoding failed')),
			format.mimeType,
			format.quality,
		);
	});
}
