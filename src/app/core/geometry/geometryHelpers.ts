import type { CropRect, Point } from '../document/appTypes';

export const MAX_CANVAS_DIMENSION = 16_384;
const POLYGON_INTERSECTION_PAIR_LENGTH = 2;

/** The drawing direction within a normalized rectangle, independent of its rotation. */
export interface RectOrientation {
	readonly flipX?: boolean;
	readonly flipY?: boolean;
}

export interface RectEndpoints {
	readonly from: Point;
	readonly to: Point;
}

export function rectOrientation(from: Point, to: Point): RectOrientation {
	return {
		...(to.x < from.x ? { flipX: true } : {}),
		...(to.y < from.y ? { flipY: true } : {}),
	};
}

/** Recovers directed corners without changing the rectangle used by generic transforms. */
export function rectEndpoints(
	rect: CropRect,
	orientation: RectOrientation = {},
): RectEndpoints {
	return {
		from: {
			x: rect.x + (orientation.flipX ? rect.width : 0),
			y: rect.y + (orientation.flipY ? rect.height : 0),
		},
		to: {
			x: rect.x + (orientation.flipX ? 0 : rect.width),
			y: rect.y + (orientation.flipY ? 0 : rect.height),
		},
	};
}

/** Even-odd scanline intersections, shared by pixel extraction and mask hit testing. */
export function polygonRowIntersections(
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

export function polygonContainsPoint(
	polygon: readonly Point[],
	point: Point,
): boolean {
	const intersections = polygonRowIntersections(polygon, point.y);
	for (
		let span = 0;
		span + 1 < intersections.length;
		span += POLYGON_INTERSECTION_PAIR_LENGTH
	)
		if (point.x >= intersections[span]! && point.x < intersections[span + 1]!)
			return true;
	return false;
}

export function normalizedRect(from: Point, to: Point): CropRect {
	return {
		x: Math.min(from.x, to.x),
		y: Math.min(from.y, to.y),
		width: Math.abs(to.x - from.x),
		height: Math.abs(to.y - from.y),
	};
}

export function clampDimension(value: string | number): number {
	return Math.max(1, Math.min(MAX_CANVAS_DIMENSION, Math.round(Number(value))));
}

export function linkedDimension(
	value: string | number,
	ratio: number,
	source: 'width' | 'height',
): number {
	const numericValue = Number(value);
	return Math.max(
		1,
		Math.round(
			source === 'width' ? numericValue / ratio : numericValue * ratio,
		),
	);
}
