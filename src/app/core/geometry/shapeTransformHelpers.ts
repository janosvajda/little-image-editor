import { degreesToRadians, Numeric } from '../../shared/math/numericConstants';
import type { CropRect, Point } from '../document/appTypes';

export const ShapeHandleId = {
	NorthWest: 'northWest',
	NorthEast: 'northEast',
	SouthEast: 'southEast',
	SouthWest: 'southWest',
	Rotate: 'rotate',
} as const;
export type ShapeHandle = (typeof ShapeHandleId)[keyof typeof ShapeHandleId];
export type ResizeHandle = Exclude<ShapeHandle, typeof ShapeHandleId.Rotate>;
export const RESIZE_HANDLES: readonly ResizeHandle[] = [
	ShapeHandleId.NorthWest,
	ShapeHandleId.NorthEast,
	ShapeHandleId.SouthEast,
	ShapeHandleId.SouthWest,
];

/** Where a rotation drag started, so rotation follows the pointer from there. */
export interface RotationOrigin {
	readonly pointer: Point;
	readonly rotation: number;
}

/** Rotation increment used while the rotation is constrained. */
export const ROTATION_SNAP_DEGREES = 15;
export interface TransformableGeometry {
	rect: CropRect;
	rotation?: number;
}

export const ShapeHandleMetrics = {
	/** Width of the band outside the frame in which a drag rotates. */
	Offset: 24,
	HitTolerance: 10,
} as const;

export type SelectionBounds = Readonly<Pick<CropRect, 'width' | 'height'>>;

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

/**
 * Places a shape that sat in frame `from` at the matching position of frame
 * `to`: its centre keeps its relative place, its size scales with the frame
 * and it turns with the frame. Groups transform through their frame this way.
 */
export function mapGeometryBetweenFrames(
	shape: TransformableGeometry,
	from: TransformableGeometry,
	to: TransformableGeometry,
): TransformableGeometry {
	const scaleX = from.rect.width === 0 ? 1 : to.rect.width / from.rect.width;
	const scaleY = from.rect.height === 0 ? 1 : to.rect.height / from.rect.height;
	const fromCenter = shapeCenter(from);
	const toCenter = shapeCenter(to);
	const local = rotatePoint(shapeCenter(shape), fromCenter, -radians(from.rotation));
	const center = rotatePoint(
		{
			x: toCenter.x + (local.x - fromCenter.x) * scaleX,
			y: toCenter.y + (local.y - fromCenter.y) * scaleY,
		},
		toCenter,
		radians(to.rotation),
	);
	const width = shape.rect.width * scaleX;
	const height = shape.rect.height * scaleY;
	return {
		rect: { x: center.x - width / 2, y: center.y - height / 2, width, height },
		rotation:
			(shape.rotation ?? 0) + (to.rotation ?? 0) - (from.rotation ?? 0),
	};
}

const PIXEL_CENTER = 0.5;

/**
 * Tests whether pixels lie inside a frame, rotation included. The rotation is
 * worked out once, so the test stays cheap when run for every pixel of a fill.
 */
export function framePixelTest(
	frame: TransformableGeometry,
): (x: number, y: number) => boolean {
	const center = shapeCenter(frame);
	const angle = -radians(frame.rotation);
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	const halfWidth = frame.rect.width / 2;
	const halfHeight = frame.rect.height / 2;
	return (x, y) => {
		const offsetX = x + PIXEL_CENTER - center.x;
		const offsetY = y + PIXEL_CENTER - center.y;
		return (
			Math.abs(offsetX * cosine - offsetY * sine) <= halfWidth &&
			Math.abs(offsetX * sine + offsetY * cosine) <= halfHeight
		);
	};
}

/** The axis-aligned rectangle covering several shapes, rotation included; `null` for none. */
export function enclosingBounds(
	shapes: Iterable<TransformableGeometry>,
): CropRect | null {
	return orientedBounds(shapes, 0)?.rect ?? null;
}

/**
 * The smallest frame turned by `rotation` degrees that covers several shapes,
 * so a rotated group keeps a frame that turns with it; `null` for none.
 */
export function orientedBounds(
	shapes: Iterable<TransformableGeometry>,
	rotation: number,
): TransformableGeometry | null {
	const origin = { x: 0, y: 0 };
	const unturn = -radians(rotation);
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const shape of shapes) {
		const corners = shapeHandles(shape);
		for (const handle of RESIZE_HANDLES) {
			const corner = rotatePoint(corners[handle], origin, unturn);
			left = Math.min(left, corner.x);
			top = Math.min(top, corner.y);
			right = Math.max(right, corner.x);
			bottom = Math.max(bottom, corner.y);
		}
	}
	if (left > right) return null;
	const width = right - left;
	const height = bottom - top;
	const center = rotatePoint(
		{ x: left + width / 2, y: top + height / 2 },
		origin,
		radians(rotation),
	);
	return {
		rect: { x: center.x - width / 2, y: center.y - height / 2, width, height },
		rotation,
	};
}

/**
 * Corner handles resize; the band just outside the frame rotates. Points
 * inside the frame are left to moving the shape.
 */
export function hitShapeHandle(
	shape: TransformableGeometry,
	point: Point,
	tolerance: number = ShapeHandleMetrics.HitTolerance,
	offset: number = ShapeHandleMetrics.Offset,
): ShapeHandle | null {
	const handles = shapeHandles(shape, offset);
	const corner = RESIZE_HANDLES.find(
		(handle) => distance(handles[handle], point) <= tolerance,
	);
	if (corner) return corner;
	return !containsTransformedPoint(shape, point) &&
		containsTransformedPoint(shape, point, offset)
		? ShapeHandleId.Rotate
		: null;
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

/** Turns the shape by the pointer's angle change around its centre since the drag began. */
export function rotateGeometryFrom(
	shape: TransformableGeometry,
	origin: RotationOrigin,
	pointer: Point,
	constrained = false,
): void {
	const center = shapeCenter(shape);
	const turned =
		origin.rotation +
		degreesBetween(center, pointer) -
		degreesBetween(center, origin.pointer);
	shape.rotation = normalizeDegrees(
		constrained
			? Math.round(turned / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES
			: turned,
	);
}

export function resizeGeometry(
	shape: TransformableGeometry,
	handle: ResizeHandle,
	pointer: Point,
	minimum = 2,
): void {
	const handles = shapeHandles(shape);
	const opposite: Record<ResizeHandle, ResizeHandle> = {
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
function degreesBetween(center: Point, point: Point): number {
	return (
		(Math.atan2(point.y - center.y, point.x - center.x) *
			Numeric.DegreesPerHalfTurn) /
		Math.PI
	);
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
