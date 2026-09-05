import type { CropRect } from '../../core/document/appTypes';

const MINIMUM_REGION_SIZE = 1;
const RGBA_CHANNEL_COUNT = 4;

export function selectedPixelBounds(
	selection: CropRect | null,
	width: number,
	height: number,
): CropRect {
	if (!selection) return { x: 0, y: 0, width, height };
	const left = Math.max(0, Math.floor(selection.x));
	const top = Math.max(0, Math.floor(selection.y));
	const right = Math.min(width, Math.ceil(selection.x + selection.width));
	const bottom = Math.min(height, Math.ceil(selection.y + selection.height));
	return {
		x: left,
		y: top,
		width: Math.max(MINIMUM_REGION_SIZE, right - left),
		height: Math.max(MINIMUM_REGION_SIZE, bottom - top),
	};
}

export function transformSelectedPixels(
	base: ImageData,
	selection: CropRect | null,
	transform: (region: ImageData) => ImageData | void,
): ImageData {
	const result = cloneImageData(base);
	const bounds = selectedPixelBounds(selection, base.width, base.height);
	const region = extractRegion(base, bounds);
	const transformed = transform(region) ?? region;
	writeRegion(result, transformed, bounds.x, bounds.y);
	return result;
}

export function mergeSelectedPixels(
	base: ImageData,
	transformed: ImageData,
	selection: CropRect | null,
): ImageData {
	if (base.width !== transformed.width || base.height !== transformed.height)
		throw new Error('Pixel buffers must have matching dimensions.');
	const result = cloneImageData(base);
	const bounds = selectedPixelBounds(selection, base.width, base.height);
	writeRegion(result, extractRegion(transformed, bounds), bounds.x, bounds.y);
	return result;
}

function extractRegion(source: ImageData, bounds: CropRect): ImageData {
	const region = new ImageData(bounds.width, bounds.height);
	for (let y = 0; y < bounds.height; y++) {
		const sourceStart =
			((bounds.y + y) * source.width + bounds.x) * RGBA_CHANNEL_COUNT;
		const sourceEnd = sourceStart + bounds.width * RGBA_CHANNEL_COUNT;
		region.data.set(
			source.data.subarray(sourceStart, sourceEnd),
			y * bounds.width * RGBA_CHANNEL_COUNT,
		);
	}
	return region;
}

function writeRegion(
	target: ImageData,
	region: ImageData,
	x: number,
	y: number,
): void {
	for (let row = 0; row < region.height; row++) {
		const targetStart =
			((y + row) * target.width + x) * RGBA_CHANNEL_COUNT;
		const regionStart = row * region.width * RGBA_CHANNEL_COUNT;
		target.data.set(
			region.data.subarray(
				regionStart,
				regionStart + region.width * RGBA_CHANNEL_COUNT,
			),
			targetStart,
		);
	}
}

function cloneImageData(source: ImageData): ImageData {
	return new ImageData(
		new Uint8ClampedArray(source.data),
		source.width,
		source.height,
	);
}
