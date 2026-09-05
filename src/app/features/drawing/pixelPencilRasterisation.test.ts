import { describe, expect, it, vi } from 'vitest';
import {
	renderPixelPencilSegment,
	type PixelCoordinate,
	visitPencilSegmentPixels,
} from './pixelPencilRenderer';

const ONE_PIXEL = 1;

describe('pixel pencil rasterisation', () => {
	it('produces exact horizontal pixels without anti-aliased coverage', () => {
		expect(pixelsBetween({ x: 2.5, y: 4.5 }, { x: 6.5, y: 4.5 })).toEqual([
			{ x: 3, y: 4 },
			{ x: 4, y: 4 },
			{ x: 5, y: 4 },
			{ x: 6, y: 4 },
		]);
	});

	it('produces deterministic vertical and diagonal stair-step pixels', () => {
		expect(pixelsBetween({ x: 3.5, y: 1.5 }, { x: 3.5, y: 4.5 })).toEqual([
			{ x: 3, y: 2 },
			{ x: 3, y: 3 },
			{ x: 3, y: 4 },
		]);
		expect(pixelsBetween({ x: 1.5, y: 1.5 }, { x: 4.5, y: 4.5 })).toEqual([
			{ x: 2, y: 2 },
			{ x: 3, y: 3 },
			{ x: 4, y: 4 },
		]);
	});

	it('paints a zero-length segment as one exact pixel', () => {
		expect(pixelsBetween({ x: 8.5, y: 9.5 }, { x: 8.5, y: 9.5 })).toEqual([
			{ x: 8, y: 9 },
		]);
	});

	it('uses fillRect rather than the anti-aliased canvas stroke API', () => {
		const fillRect = vi.fn();
		const context = { fillRect } as unknown as CanvasRenderingContext2D;

		renderPixelPencilSegment(
			context,
			{ x: 1.5, y: 1.5 },
			{ x: 3.5, y: 1.5 },
			ONE_PIXEL,
		);

		expect(fillRect.mock.calls).toEqual([
			[2, 1, ONE_PIXEL, ONE_PIXEL],
			[3, 1, ONE_PIXEL, ONE_PIXEL],
		]);
	});
});

function pixelsBetween(from: PixelCoordinate, to: PixelCoordinate): PixelCoordinate[] {
	const pixels: PixelCoordinate[] = [];
	visitPencilSegmentPixels(from, to, (pixel) => pixels.push(pixel));
	return pixels;
}
