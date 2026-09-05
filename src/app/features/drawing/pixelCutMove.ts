import type { Point } from '../../core/document/appTypes';

const CHANNELS_PER_PIXEL = 4;
const ALPHA_CHANNEL_OFFSET = 3;
const PIXEL_CENTER_OFFSET = 0.5;
const MINIMUM_POLYGON_POINTS = 3;

interface PixelBounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export function extractPixelFragment(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	selection: readonly Point[],
	replacement: ArrayLike<number> = [0, 0, 0, 0],
): ExtractedPixelFragment | null {
	if (selection.length < MINIMUM_POLYGON_POINTS) return null;
	const bounds = polygonIntegerBounds(selection, width, height);
	if (bounds.width === 0 || bounds.height === 0) return null;
	const image = context.getImageData(
		bounds.left,
		bounds.top,
		bounds.width,
		bounds.height,
	);
	const source = new Uint8ClampedArray(image.data);
	const fragment = new Uint8ClampedArray(
		bounds.width * bounds.height * CHANNELS_PER_PIXEL,
	);
	const changed = extractSelectedPixels(
		image.data,
		source,
		fragment,
		bounds,
		selection,
		replacement,
	);
	if (!changed) return null;
	context.putImageData(image, bounds.left, bounds.top);
	return { bounds, pixels: fragment };
}

export interface ExtractedPixelFragment {
	readonly bounds: Readonly<PixelBounds>;
	readonly pixels: Uint8ClampedArray;
}

function extractSelectedPixels(
	pixels: Uint8ClampedArray,
	source: Uint8ClampedArray,
	fragment: Uint8ClampedArray,
	bounds: PixelBounds,
	selection: readonly Point[],
	replacement: ArrayLike<number>,
): boolean {
	let changed = false;
	for (let y = bounds.top; y < bounds.bottom; y += 1) {
		const intersections = polygonRowIntersections(
			selection,
			y + PIXEL_CENTER_OFFSET,
		);
		for (let span = 0; span + 1 < intersections.length; span += 2) {
			const start = Math.max(
				bounds.left,
				Math.ceil(intersections[span]! - PIXEL_CENTER_OFFSET),
			);
			const end = Math.min(
				bounds.right,
				Math.ceil(intersections[span + 1]! - PIXEL_CENTER_OFFSET),
			);
			for (let x = start; x < end; x += 1) {
				const sourceIndex = pixelIndex(
					x - bounds.left,
					y - bounds.top,
					bounds.width,
				);
				if (source[sourceIndex + ALPHA_CHANNEL_OFFSET] === 0) continue;
				const fragmentIndex =
					maskIndex(x, y, bounds) * CHANNELS_PER_PIXEL;
				fragment.set(
					source.subarray(sourceIndex, sourceIndex + CHANNELS_PER_PIXEL),
					fragmentIndex,
				);
				pixels.set(replacement, sourceIndex);
				changed = true;
			}
		}
	}
	return changed;
}

function polygonRowIntersections(
	polygon: readonly Point[],
	y: number,
): number[] {
	const intersections: number[] = [];
	for (
		let current = 0, previous = polygon.length - 1;
		current < polygon.length;
		previous = current, current += 1
	) {
		const from = polygon[previous]!;
		const to = polygon[current]!;
		if (from.y > y === to.y > y) continue;
		intersections.push(
			from.x + ((y - from.y) * (to.x - from.x)) / (to.y - from.y),
		);
	}
	return intersections.sort((left, right) => left - right);
}

function polygonIntegerBounds(
	polygon: readonly Point[],
	width: number,
	height: number,
): Readonly<PixelBounds> {
	const left = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.x))));
	const top = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.y))));
	const right = Math.min(width, Math.ceil(Math.max(...polygon.map((point) => point.x))));
	const bottom = Math.min(height, Math.ceil(Math.max(...polygon.map((point) => point.y))));
	return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function pixelIndex(x: number, y: number, width: number): number {
	return (y * width + x) * CHANNELS_PER_PIXEL;
}

function maskIndex(x: number, y: number, bounds: PixelBounds): number {
	return (y - bounds.top) * bounds.width + x - bounds.left;
}
