import { describe, expect, it } from 'vitest';
import { pixelAlignedPoint } from './drawingHelpers';

const DOCUMENT_WIDTH = 800;
const DOCUMENT_HEIGHT = 600;
const ONE_PIXEL = 1;
const TWO_PIXELS = 2;

describe('zoom-invariant pixel alignment', () => {
	it('stores nearby 1 px pointer samples at the same document pixel centre', () => {
		const actualSizeSample = pixelAlignedPoint(
			{ x: 120.46, y: 84.52 },
			DOCUMENT_WIDTH,
			DOCUMENT_HEIGHT,
			ONE_PIXEL,
		);
		const magnifiedSample = pixelAlignedPoint(
			{ x: 120.49, y: 84.51 },
			DOCUMENT_WIDTH,
			DOCUMENT_HEIGHT,
			ONE_PIXEL,
		);

		expect(magnifiedSample).toEqual(actualSizeSample);
		expect(magnifiedSample).toEqual({ x: 120.5, y: 84.5 });
	});

	it('centres even-width strokes on whole document pixels', () => {
		expect(
			pixelAlignedPoint(
				{ x: 120.46, y: 84.52 },
				DOCUMENT_WIDTH,
				DOCUMENT_HEIGHT,
				TWO_PIXELS,
			),
		).toEqual({ x: 120, y: 85 });
	});

	it('keeps aligned points inside the document bounds', () => {
		expect(
			pixelAlignedPoint(
				{ x: DOCUMENT_WIDTH, y: DOCUMENT_HEIGHT },
				DOCUMENT_WIDTH,
				DOCUMENT_HEIGHT,
				ONE_PIXEL,
			),
		).toEqual({ x: 799.5, y: 599.5 });
	});
});
