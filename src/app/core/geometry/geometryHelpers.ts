import type { CropRect, Point } from '../document/appTypes';

export const MAX_CANVAS_DIMENSION = 16_384;

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
