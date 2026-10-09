import { describe, expect, it } from 'vitest';
import { decodePixelBytes, encodePixelBytes } from './pixelDataCodec';

const PACK_BITS_MAXIMUM_LENGTH = 128;
const RGBA_CHANNELS = 4;
const REPEATED_PAIR_VALUE = 200;
const TRANSPARENT_PADDING_BYTES = 4_096;

/**
 * Distinct bytes up to `literalLength`, then a two-byte run, between transparent
 * runs so run-length encoding is chosen, padded to whole RGBA pixels.
 */
function literalFollowedByPair(literalLength: number): Uint8ClampedArray {
	const bytes: number[] = new Array(TRANSPARENT_PADDING_BYTES).fill(0);
	for (let index = 1; index <= literalLength; index += 1) bytes.push(index);
	bytes.push(REPEATED_PAIR_VALUE, REPEATED_PAIR_VALUE);
	while (bytes.length % RGBA_CHANNELS !== 0) bytes.push(bytes.length);
	bytes.push(...new Array<number>(TRANSPARENT_PADDING_BYTES).fill(0));
	return Uint8ClampedArray.from(bytes);
}

describe('pixel byte codec literal boundary', () => {
	it.each([
		PACK_BITS_MAXIMUM_LENGTH - 2,
		PACK_BITS_MAXIMUM_LENGTH - 1,
		PACK_BITS_MAXIMUM_LENGTH,
	])(
		'round-trips a %i byte literal followed by a short run',
		(literalLength) => {
			const pixels = literalFollowedByPair(literalLength);
			expect(decodePixelBytes(encodePixelBytes(pixels))).toEqual(pixels);
		},
	);

	it('round-trips long mixed literal and repeated sequences', () => {
		const length = PACK_BITS_MAXIMUM_LENGTH * PACK_BITS_MAXIMUM_LENGTH;
		const pixels = Uint8ClampedArray.from({ length }, (_, index) =>
			index % 3 === 0 ? REPEATED_PAIR_VALUE : index % PACK_BITS_MAXIMUM_LENGTH,
		);
		expect(decodePixelBytes(encodePixelBytes(pixels))).toEqual(pixels);
	});
});
