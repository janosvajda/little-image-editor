import type { Point } from '../../core/document/appTypes';
import { degreesToRadians } from '../../shared/math/numericConstants';
import type { StrokeAnnotation, StrokePoint } from './annotationTypes';

export function materializeStrokeTransform(
	stroke: StrokeAnnotation,
	pointer: Point,
): void {
	const transformed = transformedStrokePoints(stroke);
	const first = transformed[0]!;
	const last = transformed.at(-1)!;
	if (pointDistance(pointer, first) < pointDistance(pointer, last))
		transformed.reverse();
	stroke.points = transformed;
	stroke.sourceRect = strokePointBounds(transformed, stroke.size);
	stroke.rect = { ...stroke.sourceRect };
	stroke.rotation = 0;
}

export function transformedStrokePoints(
	stroke: StrokeAnnotation,
): StrokePoint[] {
	const source = stroke.sourceRect ?? stroke.rect;
	const center = {
		x: stroke.rect.x + stroke.rect.width / 2,
		y: stroke.rect.y + stroke.rect.height / 2,
	};
	const radians = degreesToRadians(stroke.rotation ?? 0);
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const scaleX = source.width === 0 ? 1 : stroke.rect.width / source.width;
	const scaleY = source.height === 0 ? 1 : stroke.rect.height / source.height;
	return stroke.points.map((point) => {
		const x = stroke.rect.x + (point.x - source.x) * scaleX;
		const y = stroke.rect.y + (point.y - source.y) * scaleY;
		const offsetX = x - center.x;
		const offsetY = y - center.y;
		return {
			x: center.x + offsetX * cosine - offsetY * sine,
			y: center.y + offsetX * sine + offsetY * cosine,
			pressure: point.pressure,
		};
	});
}

export function strokePointBounds(
	points: readonly StrokePoint[],
	strokeSize: number,
): StrokeAnnotation['rect'] {
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const padding = strokeSize / 2;
	const left = Math.min(...xs) - padding;
	const top = Math.min(...ys) - padding;
	const right = Math.max(...xs) + padding;
	const bottom = Math.max(...ys) + padding;
	return { x: left, y: top, width: right - left, height: bottom - top };
}

export function distanceToStroke(
	stroke: StrokeAnnotation,
	point: Point,
): number {
	const points = transformedStrokePoints(stroke);
	let shortest = Number.POSITIVE_INFINITY;
	for (let index = 1; index < points.length; index += 1)
		shortest = Math.min(
			shortest,
			distanceToSegment(point, points[index - 1]!, points[index]!),
		);
	return shortest;
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (dx === 0 && dy === 0) return pointDistance(point, from);
	const projection = Math.max(
		0,
		Math.min(
			1,
			((point.x - from.x) * dx + (point.y - from.y) * dy) /
				(dx * dx + dy * dy),
		),
	);
	return pointDistance(point, {
		x: from.x + projection * dx,
		y: from.y + projection * dy,
	});
}

function pointDistance(left: Point, right: Point): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}
