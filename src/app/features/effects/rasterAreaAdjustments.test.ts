import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { RasterSelection } from '../selection/rasterSelection';
import { ImageOperations } from './imageOperationsController';

const PIXEL_CHANNEL_COUNT = 4;

describe('raster-area adjustments', () => {
	it('previews tone adjustments only inside the active raster selection', () => {
		const documentModel = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		documentModel.create({
			name: 'selected-adjustment',
			width: 3,
			height: 1,
			transparent: false,
			background: '#000000',
		});
		const selection = new RasterSelection(documentModel);
		selection.begin({ x: 1, y: 0 });
		selection.finish({ x: 2, y: 1 });
		new ImageOperations(documentModel, selection);
		const source = grayPixels(3, 40);
		vi.mocked(documentModel.context.getImageData).mockReturnValue(source);
		vi.mocked(documentModel.context.putImageData).mockClear();

		const brightness = document.querySelector<HTMLInputElement>(
			'#brightnessInput',
		)!;
		brightness.value = '20';
		brightness.dispatchEvent(new Event('input', { bubbles: true }));

		const rendered = vi.mocked(documentModel.context.putImageData).mock
			.calls[0]?.[0];
		expect(rendered).toBeDefined();
		expect(redChannels(rendered!)).toEqual([40, 91, 40]);
	});
});

function grayPixels(width: number, value: number): ImageData {
	const data = new Uint8ClampedArray(width * PIXEL_CHANNEL_COUNT);
	for (let index = 0; index < data.length; index += PIXEL_CHANNEL_COUNT) {
		data[index] = value;
		data[index + 1] = value;
		data[index + 2] = value;
		data[index + 3] = 255;
	}
	return new ImageData(data, width, 1);
}

function redChannels(image: ImageData): number[] {
	const channels: number[] = [];
	for (let index = 0; index < image.data.length; index += PIXEL_CHANNEL_COUNT)
		channels.push(image.data[index]!);
	return channels;
}
