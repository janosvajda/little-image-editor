import type { Point } from '../../core/document/appTypes';
import type { TransformableGeometry } from '../../core/geometry/shapeTransformHelpers';
import { degreesToRadians } from '../../shared/math/numericConstants';
import type {
	ObjectErasurePath,
	ObjectErasurePoint,
	ObjectPixelMask,
} from './annotationTypes';

const DEFAULT_PRESSURE = 1;
const MINIMUM_GEOMETRY_AREA = 1;

export interface ObjectEraserOptions {
	readonly size: number;
	readonly opacity: number;
	readonly hardness: number;
}

export function createObjectPixelMask(
	geometry: TransformableGeometry,
	points: readonly Point[],
): ObjectPixelMask {
	return {
		points: points.map((point) => {
			const local = objectLocalPoint(geometry, point, DEFAULT_PRESSURE);
			return { xRatio: local.xRatio, yRatio: local.yRatio };
		}),
	};
}

export function createObjectErasurePath(
	geometry: TransformableGeometry,
	point: Point,
	pressure: number,
	options: ObjectEraserOptions,
): ObjectErasurePath {
	const localPoint = objectLocalPoint(geometry, point, pressure);
	return {
		points: [localPoint, localPoint],
		sizeRatio:
			options.size /
			Math.sqrt(
				Math.max(
					MINIMUM_GEOMETRY_AREA,
					geometry.rect.width * geometry.rect.height,
				),
			),
		opacity: options.opacity,
		hardness: options.hardness,
	};
}

export function appendObjectErasurePoint(
	path: ObjectErasurePath,
	geometry: TransformableGeometry,
	point: Point,
	pressure: number,
): void {
	path.points.push(objectLocalPoint(geometry, point, pressure));
}

export function objectErasureCanvasPoint(
	geometry: TransformableGeometry,
	point: ObjectErasurePoint,
): Point {
	return {
		x: geometry.rect.x + point.xRatio * geometry.rect.width,
		y: geometry.rect.y + point.yRatio * geometry.rect.height,
	};
}

export function objectErasureSize(
	geometry: TransformableGeometry,
	path: ObjectErasurePath,
): number {
	return (
		path.sizeRatio *
		Math.sqrt(
			Math.max(
				MINIMUM_GEOMETRY_AREA,
				geometry.rect.width * geometry.rect.height,
			),
		)
	);
}

export function objectLocalPoint(
	geometry: TransformableGeometry,
	point: Point,
	pressure: number,
): ObjectErasurePoint {
	const centerX = geometry.rect.x + geometry.rect.width / 2;
	const centerY = geometry.rect.y + geometry.rect.height / 2;
	const radians = degreesToRadians(-(geometry.rotation ?? 0));
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const offsetX = point.x - centerX;
	const offsetY = point.y - centerY;
	const localX = centerX + offsetX * cosine - offsetY * sine;
	const localY = centerY + offsetX * sine + offsetY * cosine;
	return {
		xRatio:
			geometry.rect.width === 0
				? 0
				: (localX - geometry.rect.x) / geometry.rect.width,
		yRatio:
			geometry.rect.height === 0
				? 0
				: (localY - geometry.rect.y) / geometry.rect.height,
		pressure: pressure || DEFAULT_PRESSURE,
	};
}
