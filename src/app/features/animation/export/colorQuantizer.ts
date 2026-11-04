/**
 * Picks the few colours a palette image can show. Opaque pixels are counted
 * in a histogram of 5 bits a channel; median cut splits the counted colours
 * into boxes, each box becoming one palette colour: the exact average of the
 * pixels it holds, so an image of few colours keeps them exactly. Pixels then
 * take their box's colour, found by the same histogram.
 */

/** Bits kept of each channel when colours are counted. */
const HISTOGRAM_BITS = 5;
const BITS_PER_CHANNEL = 8;
const HISTOGRAM_SHIFT = BITS_PER_CHANNEL - HISTOGRAM_BITS;
const HISTOGRAM_LEVELS = 1 << HISTOGRAM_BITS;
const RGBA_CHANNELS = 4;
const RGB_CHANNELS = 3;
const ALPHA_OFFSET = 3;
/** Pixels at least this opaque are drawn; others are transparent, as a palette image has only see-through or not. */
export const OPAQUE_THRESHOLD = 128;

/** A palette, and each pixel's index into it; `transparentIndex` is the index of see-through pixels, if any. */
export interface QuantizedImage {
	readonly palette: Uint8Array;
	readonly indices: Uint8Array;
	readonly transparentIndex: number | null;
}

interface ColorBox {
	readonly buckets: number[];
	readonly count: number;
}

/** An image's pixels in at most `maxColors` colours, one of them kept for transparency when the image has any. */
export function quantize(pixels: Uint8ClampedArray, maxColors: number): QuantizedImage {
	const counts = new Uint32Array(HISTOGRAM_LEVELS ** RGB_CHANNELS);
	// The pixels' own channel values, summed for each bucket, so a box's colour is their exact average.
	const sums = new Float64Array(counts.length * RGB_CHANNELS);
	let transparent = false;
	for (let offset = 0; offset < pixels.length; offset += RGBA_CHANNELS) {
		if (pixels[offset + ALPHA_OFFSET]! < OPAQUE_THRESHOLD) {
			transparent = true;
			continue;
		}
		const bucket = bucketOf(pixels, offset);
		counts[bucket]!++;
		for (let channel = 0; channel < RGB_CHANNELS; channel++) sums[bucket * RGB_CHANNELS + channel]! += pixels[offset + channel]!;
	}
	const used = [...counts.keys()].filter((bucket) => counts[bucket]! > 0);
	const boxes = medianCut(used, counts, Math.max(1, maxColors - (transparent ? 1 : 0)));
	const colorCount = boxes.length + (transparent ? 1 : 0);
	const palette = new Uint8Array(Math.max(1, colorCount) * RGB_CHANNELS);
	const indexOfBucket = new Uint8Array(counts.length);
	boxes.forEach((box, index) => {
		palette.set(averageColor(box, sums), index * RGB_CHANNELS);
		for (const bucket of box.buckets) indexOfBucket[bucket] = index;
	});
	const transparentIndex = transparent ? boxes.length : null;
	const indices = new Uint8Array(pixels.length / RGBA_CHANNELS);
	for (let pixel = 0, offset = 0; offset < pixels.length; pixel++, offset += RGBA_CHANNELS)
		indices[pixel] = pixels[offset + ALPHA_OFFSET]! < OPAQUE_THRESHOLD ? transparentIndex! : indexOfBucket[bucketOf(pixels, offset)]!;
	return { palette, indices, transparentIndex };
}

function bucketOf(pixels: Uint8ClampedArray, offset: number): number {
	return ((pixels[offset]! >> HISTOGRAM_SHIFT) << (HISTOGRAM_BITS * 2)) | ((pixels[offset + 1]! >> HISTOGRAM_SHIFT) << HISTOGRAM_BITS) | (pixels[offset + 2]! >> HISTOGRAM_SHIFT);
}

function channelOf(bucket: number, channel: number): number {
	return (bucket >> (HISTOGRAM_BITS * (RGB_CHANNELS - 1 - channel))) & (HISTOGRAM_LEVELS - 1);
}

/** Splits the colours into boxes, always the box with the most pixels and more than one colour, along its widest channel at its median. */
function medianCut(buckets: readonly number[], counts: Uint32Array, maxBoxes: number): ColorBox[] {
	const boxes: ColorBox[] = buckets.length ? [{ buckets: [...buckets], count: buckets.reduce((sum, bucket) => sum + counts[bucket]!, 0) }] : [];
	while (boxes.length < maxBoxes) {
		const splittable = boxes.filter((box) => box.buckets.length > 1);
		if (!splittable.length) break;
		const box = splittable.reduce((largest, candidate) => (candidate.count > largest.count ? candidate : largest));
		const channel = widestChannel(box);
		const sorted = [...box.buckets].sort((left, right) => channelOf(left, channel) - channelOf(right, channel));
		// The median: the first place where the colours before it hold half the pixels, leaving at least one colour on each side.
		let split = 1;
		let seen = counts[sorted[0]!]!;
		while (split < sorted.length - 1 && seen * 2 < box.count) seen += counts[sorted[split++]!]!;
		const first = sorted.slice(0, split);
		const second = sorted.slice(split);
		const total = (part: readonly number[]) => part.reduce((sum, bucket) => sum + counts[bucket]!, 0);
		boxes.splice(boxes.indexOf(box), 1, { buckets: first, count: total(first) }, { buckets: second, count: total(second) });
	}
	return boxes;
}

function widestChannel({ buckets }: ColorBox): number {
	let widest = 0;
	let widestRange = -1;
	for (let channel = 0; channel < RGB_CHANNELS; channel++) {
		const values = buckets.map((bucket) => channelOf(bucket, channel));
		const range = Math.max(...values) - Math.min(...values);
		if (range > widestRange) {
			widest = channel;
			widestRange = range;
		}
	}
	return widest;
}

/** A box's colour: the average of the pixels it holds. */
function averageColor({ buckets, count }: ColorBox, sums: Float64Array): number[] {
	const totals = [0, 0, 0];
	for (const bucket of buckets) for (let channel = 0; channel < RGB_CHANNELS; channel++) totals[channel]! += sums[bucket * RGB_CHANNELS + channel]!;
	return totals.map((total) => Math.round(total / count));
}
