import type { Point } from '../../core/document/appTypes';
import { degreesToRadians } from '../../shared/math/numericConstants';
import type {
	StrokeAnnotation,
	StrokePathStyle,
	StrokePoint,
} from './annotationTypes';

export function maximumStrokeSize(stroke: StrokeAnnotation): number {
	let maximum = stroke.size;
	for (const style of stroke.pathStyles ?? [])
		maximum = Math.max(maximum, style.size);
	return maximum;
}

/** The style values of a stroke that can be edited after it was drawn. */
export type StrokeStyleChange = Partial<
	Pick<StrokeAnnotation, 'color' | 'size' | 'opacity' | 'hardness'>
>;

/**
 * Restyles a whole stroke, including every path style, so it renders as one
 * look. A new width grows or shrinks its bounds around the same path.
 */
export function restyleStroke(
	stroke: StrokeAnnotation,
	change: StrokeStyleChange,
): void {
	Object.assign(stroke, change);
	for (const style of stroke.pathStyles ?? []) Object.assign(style, change);
	if (change.size === undefined || stroke.points.length === 0) return;
	const previous = stroke.sourceRect ?? stroke.rect;
	const next = strokePointBounds(stroke.points, maximumStrokeSize(stroke));
	const scaleX = previous.width === 0 ? 1 : stroke.rect.width / previous.width;
	const scaleY = previous.height === 0 ? 1 : stroke.rect.height / previous.height;
	stroke.rect = {
		x: stroke.rect.x + (next.x - previous.x) * scaleX,
		y: stroke.rect.y + (next.y - previous.y) * scaleY,
		width: next.width * scaleX,
		height: next.height * scaleY,
	};
	stroke.sourceRect = next;
}

export function strokePathStyleAt(
	stroke: StrokeAnnotation,
	pointIndex: number,
): StrokePathStyle {
	const fallback: StrokePathStyle = {
		startIndex: 0,
		tool: stroke.tool,
		color: stroke.color,
		size: stroke.size,
		opacity: stroke.opacity,
		hardness: stroke.hardness,
		seed: stroke.seed,
	};
	let resolved = fallback;
	for (const style of stroke.pathStyles ?? []) {
		if (style.startIndex > pointIndex) break;
		resolved = style;
	}
	return resolved;
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
	const padding = strokeSize / 2;
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		left = Math.min(left, point.x);
		top = Math.min(top, point.y);
		right = Math.max(right, point.x);
		bottom = Math.max(bottom, point.y);
	}
	left -= padding;
	top -= padding;
	right += padding;
	bottom += padding;
	return { x: left, y: top, width: right - left, height: bottom - top };
}

export function strokeContainsPoint(
	stroke: StrokeAnnotation,
	point: Point,
	tolerance: number,
): boolean {
	if (stroke.points.length < 2) return false;
	const transform = new StrokeCoordinateTransform(stroke);
	const toleranceSquared = tolerance * tolerance;
	const first = stroke.points[0]!;
	let previousX = transform.x(first);
	let previousY = transform.y(first);
	const pathStarts = new Set(stroke.pathStarts);
	for (let index = 1; index < stroke.points.length; index += 1) {
		if (pathStarts.has(index)) {
			const current = stroke.points[index]!;
			previousX = transform.x(current);
			previousY = transform.y(current);
			continue;
		}
		const current = stroke.points[index]!;
		const currentX = transform.x(current);
		const currentY = transform.y(current);
		if (
			squaredDistanceToSegmentCoordinates(
				point.x,
				point.y,
				previousX,
				previousY,
				currentX,
				currentY,
			) <= toleranceSquared
		)
			return true;
		previousX = currentX;
		previousY = currentY;
	}
	return false;
}

function squaredDistanceToSegmentCoordinates(
	pointX: number,
	pointY: number,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
): number {
	const dx = toX - fromX;
	const dy = toY - fromY;
	if (dx === 0 && dy === 0) {
		const pointDx = pointX - fromX;
		const pointDy = pointY - fromY;
		return pointDx * pointDx + pointDy * pointDy;
	}
	const projection = Math.max(
		0,
		Math.min(
			1,
			((pointX - fromX) * dx + (pointY - fromY) * dy) /
				(dx * dx + dy * dy),
		),
	);
	const offsetX = pointX - (fromX + projection * dx);
	const offsetY = pointY - (fromY + projection * dy);
	return offsetX * offsetX + offsetY * offsetY;
}

class StrokeCoordinateTransform {
	readonly #source;
	readonly #centerX;
	readonly #centerY;
	readonly #cosine;
	readonly #sine;
	readonly #scaleX;
	readonly #scaleY;

	constructor(private readonly stroke: StrokeAnnotation) {
		this.#source = stroke.sourceRect ?? stroke.rect;
		this.#centerX = stroke.rect.x + stroke.rect.width / 2;
		this.#centerY = stroke.rect.y + stroke.rect.height / 2;
		const radians = degreesToRadians(stroke.rotation ?? 0);
		this.#cosine = Math.cos(radians);
		this.#sine = Math.sin(radians);
		this.#scaleX =
			this.#source.width === 0
				? 1
				: stroke.rect.width / this.#source.width;
		this.#scaleY =
			this.#source.height === 0
				? 1
				: stroke.rect.height / this.#source.height;
	}

	x(point: StrokePoint): number {
		const x = this.unrotatedX(point);
		const y = this.unrotatedY(point);
		return (
			this.#centerX +
			(x - this.#centerX) * this.#cosine -
			(y - this.#centerY) * this.#sine
		);
	}

	y(point: StrokePoint): number {
		const x = this.unrotatedX(point);
		const y = this.unrotatedY(point);
		return (
			this.#centerY +
			(x - this.#centerX) * this.#sine +
			(y - this.#centerY) * this.#cosine
		);
	}

	private unrotatedX(point: StrokePoint): number {
		return this.stroke.rect.x + (point.x - this.#source.x) * this.#scaleX;
	}

	private unrotatedY(point: StrokePoint): number {
		return this.stroke.rect.y + (point.y - this.#source.y) * this.#scaleY;
	}
}
