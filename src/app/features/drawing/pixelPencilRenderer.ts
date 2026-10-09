import type { Point } from '../../core/document/appTypes';

export interface PixelCoordinate {
	readonly x: number;
	readonly y: number;
}

type PixelVisitor = (pixel: PixelCoordinate) => void;

const MINIMUM_PENCIL_WIDTH = 1;
const HALF_DIVISOR = 2;
const PIXEL_CENTER_OFFSET = 0.5;

/**
 * Rasterises a pencil segment with integer Bresenham traversal. The first pixel
 * is omitted for non-zero-length segments so adjoining segments do not repaint
 * their shared endpoint. A zero-length segment still paints one pixel.
 */
export function visitPencilSegmentPixels(
	from: Point,
	to: Point,
	visit: PixelVisitor,
): void {
	let x = Math.floor(from.x);
	let y = Math.floor(from.y);
	const targetX = Math.floor(to.x);
	const targetY = Math.floor(to.y);
	const deltaX = Math.abs(targetX - x);
	const deltaY = Math.abs(targetY - y);
	const stepX = x < targetX ? 1 : -1;
	const stepY = y < targetY ? 1 : -1;
	let error = deltaX - deltaY;
	let isFirstPixel = true;
	const isPoint = x === targetX && y === targetY;

	for (;;) {
		if (!isFirstPixel || isPoint) visit({ x, y });
		if (x === targetX && y === targetY) return;
		isFirstPixel = false;
		const doubledError = error * HALF_DIVISOR;
		if (doubledError > -deltaY) {
			error -= deltaY;
			x += stepX;
		}
		if (doubledError < deltaX) {
			error += deltaX;
			y += stepY;
		}
	}
}

export function renderPixelPencilSegment(
	context: CanvasRenderingContext2D,
	from: Point,
	to: Point,
	width: number,
): void {
	const diameter = Math.max(MINIMUM_PENCIL_WIDTH, Math.round(width));
	if (diameter === MINIMUM_PENCIL_WIDTH) {
		visitPencilSegmentPixels(from, to, ({ x, y }) =>
			context.fillRect(x, y, MINIMUM_PENCIL_WIDTH, MINIMUM_PENCIL_WIDTH),
		);
		return;
	}

	visitPencilSegmentPixels(from, to, (pixel) =>
		renderPencilStamp(context, pixel, diameter),
	);
}

function renderPencilStamp(
	context: CanvasRenderingContext2D,
	cell: PixelCoordinate,
	diameter: number,
): void {
	const radius = diameter / HALF_DIVISOR;
	const centerOffset =
		diameter % HALF_DIVISOR === 0 ? 0 : PIXEL_CENTER_OFFSET;
	const centerX = cell.x + centerOffset;
	const centerY = cell.y + centerOffset;
	const left = Math.round(centerX - radius);
	const top = Math.round(centerY - radius);
	const radiusSquared = radius * radius;
	// A disc's covered pixels in each row are contiguous, so each row is one span.
	for (let yOffset = 0; yOffset < diameter; yOffset += 1) {
		const deltaY = top + yOffset + PIXEL_CENTER_OFFSET - centerY;
		let first = -1;
		let last = -1;
		for (let xOffset = 0; xOffset < diameter; xOffset += 1) {
			const deltaX = left + xOffset + PIXEL_CENTER_OFFSET - centerX;
			if (deltaX * deltaX + deltaY * deltaY > radiusSquared) continue;
			if (first < 0) first = xOffset;
			last = xOffset;
		}
		if (first >= 0)
			context.fillRect(left + first, top + yOffset, last - first + 1, 1);
	}
}
