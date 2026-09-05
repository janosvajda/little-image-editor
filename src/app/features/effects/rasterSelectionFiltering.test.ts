import { describe, expect, it } from 'vitest';
import type { CropRect } from '../../core/document/appTypes';
import {
	mergeSelectedPixels,
	transformSelectedPixels,
} from './selectionAwareImageData';

const PIXEL_CHANNELS = 4;

describe('selection-aware raster filtering', () => {
	it('changes only pixels inside the selected rectangle', () => {
		const source = opaqueImage(4, 3, 20);
		const selection: CropRect = { x: 1, y: 1, width: 2, height: 1 };
		const result = transformSelectedPixels(source, selection, (region) => {
			for (let index = 0; index < region.data.length; index += PIXEL_CHANNELS)
				region.data[index] = 200;
		});

		expect(redChannels(result)).toEqual([
			20, 20, 20, 20,
			20, 200, 200, 20,
			20, 20, 20, 20,
		]);
	});

	it('preserves whole-image behavior when there is no raster selection', () => {
		const source = opaqueImage(2, 2, 10);
		const result = transformSelectedPixels(source, null, (region) => {
			for (let index = 0; index < region.data.length; index += PIXEL_CHANNELS)
				region.data[index] = 90;
		});

		expect(redChannels(result)).toEqual([90, 90, 90, 90]);
	});

	it('normalizes fractional selection edges to complete image pixels', () => {
		const source = opaqueImage(3, 2, 15);
		const result = transformSelectedPixels(
			source,
			{ x: 0.8, y: 0.2, width: 1.1, height: 0.9 },
			(region) => {
				for (let index = 0; index < region.data.length; index += PIXEL_CHANNELS)
					region.data[index] = 70;
			},
		);

		expect(redChannels(result)).toEqual([70, 70, 15, 70, 70, 15]);
	});

	it('merges a context-dependent filter without changing pixels outside the selection', () => {
		const source = opaqueImage(3, 2, 10);
		const transformed = opaqueImage(3, 2, 80);
		const result = mergeSelectedPixels(
			source,
			transformed,
			{ x: 1, y: 0, width: 1, height: 2 },
		);

		expect(redChannels(result)).toEqual([10, 80, 10, 10, 80, 10]);
	});
});

function opaqueImage(width: number, height: number, red: number): ImageData {
	const data = new Uint8ClampedArray(width * height * PIXEL_CHANNELS);
	for (let index = 0; index < data.length; index += PIXEL_CHANNELS) {
		data[index] = red;
		data[index + 3] = 255;
	}
	return new ImageData(data, width, height);
}

function redChannels(image: ImageData): number[] {
	const values: number[] = [];
	for (let index = 0; index < image.data.length; index += PIXEL_CHANNELS)
		values.push(image.data[index]!);
	return values;
}
