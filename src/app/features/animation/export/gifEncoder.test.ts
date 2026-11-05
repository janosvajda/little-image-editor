import { describe, expect, it } from 'vitest';
import { quantize } from './colorQuantizer';
import { compress, encodeGif } from './gifEncoder';
import { gifTiming } from './animationFrames';

const RGBA_CHANNELS = 4;

/** GIF's LZW decoded, written separately from the encoder, so the two check each other. */
function decompress(data: Uint8Array, minCodeSize: number): number[] {
	const clear = 1 << minCodeSize;
	const end = clear + 1;
	let codeSize = minCodeSize + 1;
	let dictionary: number[][] = [];
	const reset = () => {
		dictionary = Array.from({ length: end + 1 }, (_, index) => [index]);
		codeSize = minCodeSize + 1;
	};
	reset();
	const output: number[] = [];
	let bitPosition = 0;
	const read = () => {
		let code = 0;
		for (let bit = 0; bit < codeSize; bit++, bitPosition++) code |= ((data[bitPosition >> 3]! >> (bitPosition & 7)) & 1) << bit;
		return code;
	};
	let previous: number[] | null = null;
	for (;;) {
		const code = read();
		if (code === clear) {
			reset();
			previous = null;
			continue;
		}
		if (code === end) return output;
		const entry = dictionary[code] ?? (previous ? [...previous, previous[0]!] : []);
		output.push(...entry);
		if (previous) dictionary.push([...previous, entry[0]!]);
		if (dictionary.length === 1 << codeSize && codeSize < 12) codeSize++;
		previous = entry;
	}
}

/** Pixels of one colour, `count` of them. */
function solid(rgba: readonly [number, number, number, number], count: number): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(count * RGBA_CHANNELS);
	for (let offset = 0; offset < pixels.length; offset += RGBA_CHANNELS) pixels.set(rgba, offset);
	return pixels;
}

describe('GIF LZW', () => {
	it('round-trips short, repetitive and long index streams through its own decoder', () => {
		const random = (seed: number) => () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) >> 16) & 3;
		const next = random(7);
		const streams = [[0], [1, 1, 1, 1, 1, 1, 1, 1], Array.from({ length: 20_000 }, next), Array.from({ length: 300 }, (_, index) => index % 4)];
		for (const stream of streams) expect(decompress(compress(Uint8Array.from(stream), 2), 2)).toEqual(stream);
		expect(decompress(compress(new Uint8Array(), 2), 2)).toEqual([]);
	});
});

describe('palette', () => {
	it('keeps a few colours exactly, and transparent pixels apart', () => {
		const pixels = new Uint8ClampedArray([...[255, 0, 0, 255], ...[0, 0, 255, 255], ...[0, 0, 0, 0], ...[255, 0, 0, 255]]);
		const { palette, indices, transparentIndex } = quantize(pixels, 256);
		const colourOf = (index: number) => [...palette.subarray(index * 3, index * 3 + 3)];
		expect(colourOf(indices[0]!)).toEqual([255, 0, 0]);
		expect(colourOf(indices[1]!)).toEqual([0, 0, 255]);
		expect(indices[2]).toBe(transparentIndex);
		expect(indices[3]).toBe(indices[0]);
	});

	it('merges colours into as many as it may have', () => {
		const pixels = new Uint8ClampedArray(Array.from({ length: 64 }, (_, index) => [index * 4, 255 - index * 4, index * 2, 255]).flat());
		const { palette, transparentIndex } = quantize(pixels, 8);
		expect(palette.length / 3).toBe(8);
		expect(transparentIndex).toBeNull();
	});
});

describe('animated GIF', () => {
	it('writes the header, a loop, and each frame with its delay and colours', () => {
		const frames = [
			{ pixels: solid([255, 255, 255, 255], 4), delay: 8 },
			{ pixels: solid([0, 0, 0, 255], 4), delay: 9 },
		];
		const gif = encodeGif(frames, { width: 2, height: 2, loop: true });
		const text = String.fromCharCode(...gif);
		expect(text.startsWith('GIF89a')).toBe(true);
		expect(text).toContain('NETSCAPE2.0');
		expect(gif.at(-1)).toBe(0x3b);
		const delays = [...text.matchAll(/\x21\xf9\x04(.)(.)(.)/gs)].map((match) => match[2]!.charCodeAt(0) | (match[3]!.charCodeAt(0) << 8));
		expect(delays).toEqual([8, 9]);
		expect(String.fromCharCode(...encodeGif(frames, { width: 2, height: 2, loop: false }))).not.toContain('NETSCAPE2.0');
	});

	it('times frames from where each starts, so it never drifts, and never shows one too briefly', () => {
		expect(gifTiming(10, 3)).toEqual([
			{ frame: 0, delay: 10 },
			{ frame: 1, delay: 10 },
			{ frame: 2, delay: 10 },
		]);
		const third = gifTiming(30, 3);
		expect(third.map(({ delay }) => delay)).toEqual([3, 4, 3]);
		expect(third.reduce((sum, { delay }) => sum + delay, 0)).toBe(10);
		const fast = gifTiming(100, 10);
		expect(fast.every(({ delay }) => delay >= 2)).toBe(true);
		expect(fast.reduce((sum, { delay }) => sum + delay, 0)).toBe(10);
		expect(fast.map(({ frame }) => frame)).toEqual([0, 2, 4, 6, 8]);
	});
});
