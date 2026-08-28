import type { CropRect, Point } from '../document/appTypes';
import { Numeric, degreesToRadians } from '../../shared/math/numericConstants';

export const ShapeHandleId = {
	NorthWest: 'northWest',
	NorthEast: 'northEast',
	SouthEast: 'southEast',
	SouthWest: 'southWest',
	Rotate: 'rotate',
} as const;
export type ShapeHandle = (typeof ShapeHandleId)[keyof typeof ShapeHandleId];
export interface TransformableGeometry {
	rect: CropRect;
	rotation?: number;
}

export const ShapeHandleMetrics = {
	Offset: 24,
	HitTolerance: 10,
} as const;

export function shapeMoveHandle(
	shape: TransformableGeometry,
	offset: number = ShapeHandleMetrics.Offset,
): Point {
	const center = shapeCenter(shape);
	return rotatePoint(
		{ x: center.x + offset, y: shape.rect.y - offset },
		center,
		radians(shape.rotation),
	);
}

export function hitShapeMoveHandle(
	shape: TransformableGeometry,
	point: Point,
	tolerance: number = ShapeHandleMetrics.HitTolerance,
	offset: number = ShapeHandleMetrics.Offset,
): boolean {
	return distance(shapeMoveHandle(shape, offset), point) <= tolerance;
}

export function shapeCenter(shape: TransformableGeometry): Point {
	return {
		x: shape.rect.x + shape.rect.width / 2,
		y: shape.rect.y + shape.rect.height / 2,
	};
}

export function shapeHandles(
	shape: TransformableGeometry,
	offset: number = ShapeHandleMetrics.Offset,
): Readonly<Record<ShapeHandle, Point>> {
	const { x, y, width, height } = shape.rect;
	const center = shapeCenter(shape);
	const rotate = (point: Point) =>
		rotatePoint(point, center, radians(shape.rotation));
	return {
		[ShapeHandleId.NorthWest]: rotate({ x, y }),
		[ShapeHandleId.NorthEast]: rotate({ x: x + width, y }),
		[ShapeHandleId.SouthEast]: rotate({ x: x + width, y: y + height }),
		[ShapeHandleId.SouthWest]: rotate({ x, y: y + height }),
		[ShapeHandleId.Rotate]: rotate({
			x: center.x,
			y: y - offset,
		}),
	};
}

export function hitShapeHandle(
	shape: TransformableGeometry,
	point: Point,
	tolerance: number = ShapeHandleMetrics.HitTolerance,
	offset: number = ShapeHandleMetrics.Offset,
): ShapeHandle | null {
	const handles = shapeHandles(shape, offset);
	return (
		(Object.keys(handles) as ShapeHandle[]).find(
			(key) => distance(handles[key], point) <= tolerance,
		) ?? null
	);
}

export function containsTransformedPoint(
	shape: TransformableGeometry,
	point: Point,
	padding = 0,
): boolean {
	const local = rotatePoint(
		point,
		shapeCenter(shape),
		-radians(shape.rotation),
	);
	return (
		local.x >= shape.rect.x - padding &&
		local.x <= shape.rect.x + shape.rect.width + padding &&
		local.y >= shape.rect.y - padding &&
		local.y <= shape.rect.y + shape.rect.height + padding
	);
}

export function rotateGeometry(
	shape: TransformableGeometry,
	pointer: Point,
): void {
	const center = shapeCenter(shape);
	shape.rotation = normalizeDegrees(
		(Math.atan2(pointer.y - center.y, pointer.x - center.x) *
			Numeric.DegreesPerHalfTurn) /
			Math.PI +
			Numeric.DegreesPerQuarterTurn,
	);
}

export function resizeGeometry(
	shape: TransformableGeometry,
	handle: Exclude<ShapeHandle, typeof ShapeHandleId.Rotate>,
	pointer: Point,
	minimum = 2,
): void {
	const handles = shapeHandles(shape);
	const opposite: Record<
		Exclude<ShapeHandle, typeof ShapeHandleId.Rotate>,
		Exclude<ShapeHandle, typeof ShapeHandleId.Rotate>
	> = {
		[ShapeHandleId.NorthWest]: ShapeHandleId.SouthEast,
		[ShapeHandleId.NorthEast]: ShapeHandleId.SouthWest,
		[ShapeHandleId.SouthEast]: ShapeHandleId.NorthWest,
		[ShapeHandleId.SouthWest]: ShapeHandleId.NorthEast,
	};
	const anchor = handles[opposite[handle]];
	const angle = radians(shape.rotation);
	const localPointer = rotatePoint(pointer, anchor, -angle);
	const horizontalSign =
		handle === ShapeHandleId.NorthWest || handle === ShapeHandleId.SouthWest
			? -1
			: 1;
	const verticalSign =
		handle === ShapeHandleId.NorthWest || handle === ShapeHandleId.NorthEast
			? -1
			: 1;
	const width = Math.max(minimum, Math.abs(localPointer.x - anchor.x));
	const height = Math.max(minimum, Math.abs(localPointer.y - anchor.y));
	const localCenter = {
		x: anchor.x + (horizontalSign * width) / 2,
		y: anchor.y + (verticalSign * height) / 2,
	};
	const center = rotatePoint(localCenter, anchor, angle);
	shape.rect = {
		x: center.x - width / 2,
		y: center.y - height / 2,
		width,
		height,
	};
}

export function withShapeTransform(
	context: CanvasRenderingContext2D,
	shape: TransformableGeometry,
	draw: () => void,
): void {
	if (!shape.rotation) {
		draw();
		return;
	}
	const center = shapeCenter(shape);
	context.save();
	context.translate(center.x, center.y);
	context.rotate(radians(shape.rotation));
	context.translate(-center.x, -center.y);
	draw();
	context.restore();
}

function rotatePoint(point: Point, center: Point, angle: number): Point {
	const cosine = Math.cos(angle),
		sine = Math.sin(angle),
		x = point.x - center.x,
		y = point.y - center.y;
	return {
		x: center.x + x * cosine - y * sine,
		y: center.y + x * sine + y * cosine,
	};
}
function radians(degrees = 0): number {
	return degreesToRadians(degrees);
}
function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}
function normalizeDegrees(value: number): number {
	return (
		((value % Numeric.DegreesPerTurn) + Numeric.DegreesPerTurn) %
		Numeric.DegreesPerTurn
	);
}
