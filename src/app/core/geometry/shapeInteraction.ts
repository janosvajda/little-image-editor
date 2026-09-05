import type { Point } from '../document/appTypes';
import {
	containsTransformedPoint,
	hitShapeHandle,
	hitShapeMoveHandle,
	resizeGeometry,
	rotateGeometry,
	type SelectionBounds,
	type ShapeHandle,
	ShapeHandleId,
	ShapeHandleMetrics,
	shapeHandles,
	shapeMoveHandle,
	type TransformableGeometry,
} from './shapeTransformHelpers';

export interface ShapeInteractionPolicy {
	handles(
		geometry: TransformableGeometry,
	): Readonly<Record<ShapeHandle, Point>>;
	hitHandle(
		geometry: TransformableGeometry,
		point: Point,
		visualScale?: number,
	): ShapeHandle | null;
	moveHandle(
		geometry: TransformableGeometry,
		visualScale?: number,
		bounds?: SelectionBounds,
	): Point;
	hitMoveHandle(
		geometry: TransformableGeometry,
		point: Point,
		visualScale?: number,
		bounds?: SelectionBounds,
	): boolean;
	contains(
		geometry: TransformableGeometry,
		point: Point,
		padding?: number,
	): boolean;
	cursor(
		geometry: TransformableGeometry,
		point: Point,
		visualScale?: number,
	): string | null;
	handleCursor(
		geometry: TransformableGeometry,
		point: Point,
		visualScale?: number,
	): string | null;
	transform(
		geometry: TransformableGeometry,
		handle: ShapeHandle,
		point: Point,
	): void;
}

const DEFAULT_HIT_PADDING = 6;
const QUARTER_TURN_DEGREES = 90;
const ROTATE_CURSOR =
	'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M19 8V3l-2 2a8 8 0 1 0 2.2 8%27 fill=%27none%27 stroke=%27white%27 stroke-width=%274%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3Cpath d=%27M19 8V3l-5 .2%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3Cpath d=%27M19.2 13A8 8 0 1 1 17 5%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27/%3E%3C/svg%3E") 12 12, alias';

export class DefaultShapeInteractionPolicy implements ShapeInteractionPolicy {
	handles(
		geometry: TransformableGeometry,
	): Readonly<Record<ShapeHandle, Point>> {
		return shapeHandles(geometry);
	}
	hitHandle(
		geometry: TransformableGeometry,
		point: Point,
		visualScale = 1,
	): ShapeHandle | null {
		return hitShapeHandle(
			geometry,
			point,
			ShapeHandleMetrics.HitTolerance * visualScale,
			ShapeHandleMetrics.Offset * visualScale,
		);
	}
	moveHandle(
		geometry: TransformableGeometry,
		visualScale = 1,
		bounds?: SelectionBounds,
	): Point {
		return shapeMoveHandle(
			geometry,
			ShapeHandleMetrics.Offset * visualScale,
			bounds,
		);
	}
	hitMoveHandle(
		geometry: TransformableGeometry,
		point: Point,
		visualScale = 1,
		bounds?: SelectionBounds,
	): boolean {
		return hitShapeMoveHandle(
			geometry,
			point,
			ShapeHandleMetrics.HitTolerance * visualScale,
			ShapeHandleMetrics.Offset * visualScale,
			bounds,
		);
	}
	contains(
		geometry: TransformableGeometry,
		point: Point,
		padding = DEFAULT_HIT_PADDING,
	): boolean {
		return containsTransformedPoint(geometry, point, padding);
	}
	cursor(
		geometry: TransformableGeometry,
		point: Point,
		visualScale = 1,
	): string | null {
		const handleCursor = this.handleCursor(geometry, point, visualScale);
		if (handleCursor) return handleCursor;
		if (this.hitMoveHandle(geometry, point, visualScale)) return 'move';
		return this.contains(geometry, point) ? 'move' : null;
	}
	handleCursor(
		geometry: TransformableGeometry,
		point: Point,
		visualScale = 1,
	): string | null {
		const handle = this.hitHandle(geometry, point, visualScale);
		if (handle === ShapeHandleId.Rotate) return ROTATE_CURSOR;
		if (handle) return resizeCursor(handle, geometry.rotation ?? 0);
		return null;
	}
	transform(
		geometry: TransformableGeometry,
		handle: ShapeHandle,
		point: Point,
	): void {
		if (handle === ShapeHandleId.Rotate) rotateGeometry(geometry, point);
		else resizeGeometry(geometry, handle, point);
	}
}

export const DEFAULT_SHAPE_INTERACTION = new DefaultShapeInteractionPolicy();

function resizeCursor(
	handle: Exclude<ShapeHandle, typeof ShapeHandleId.Rotate>,
	rotation: number,
): string {
	const northWestAxis =
		handle === ShapeHandleId.NorthWest || handle === ShapeHandleId.SouthEast;
	const quarterTurns = Math.round(rotation / QUARTER_TURN_DEGREES) % 2;
	return northWestAxis !== Boolean(quarterTurns)
		? 'nwse-resize'
		: 'nesw-resize';
}
