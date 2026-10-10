import type { Point } from '../../core/document/appTypes';
import type { TransformableGeometry } from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import { polygonContainsPoint } from '../../core/geometry/geometryHelpers';
import { degreesToRadians } from '../../shared/math/numericConstants';
import type {
	AnnotationObject,
	ObjectErasurePath,
	ObjectErasurePoint,
	ObjectPixelMask,
} from './annotationTypes';
import { AnnotationObjectTypeId } from './annotationTypes';
import { strokeContainsPoint } from './strokeGeometry';

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
	point: Pick<ObjectErasurePoint, 'xRatio' | 'yRatio'>,
): Point {
	return {
		x: geometry.rect.x + point.xRatio * geometry.rect.width,
		y: geometry.rect.y + point.yRatio * geometry.rect.height,
	};
}

/** A mask vertex before the object's rotation, including a stroke's original cut frame. */
export function objectPixelMaskCanvasPoint(
	object: AnnotationObject,
	mask: ObjectPixelMask,
	point: ObjectPixelMask['points'][number],
): Point {
	if (object.type !== AnnotationObjectTypeId.Stroke || !mask.strokeSourceRect)
		return objectErasureCanvasPoint(genericShape(object).geometry, point);
	const reference = mask.strokeSourceRect;
	const source = object.sourceRect ?? object.rect;
	const scaleX = source.width === 0 ? 1 : object.rect.width / source.width;
	const scaleY = source.height === 0 ? 1 : object.rect.height / source.height;
	return {
		x:
			object.rect.x +
			(reference.x + point.xRatio * reference.width - source.x) * scaleX,
		y:
			object.rect.y +
			(reference.y + point.yRatio * reference.height - source.y) * scaleY,
	};
}

/** Cut holes expose the content below; stroke segments painted after a cut remain hittable. */
export function objectPixelMasksAllowPoint(
	object: AnnotationObject,
	point: Point,
	strokeTolerance: number,
): boolean {
	if (!object.pixelCutouts?.length && !object.pixelClips?.length) return true;
	const geometry = genericShape(object).geometry;
	const unrotated = objectErasureCanvasPoint(
		geometry,
		objectLocalPoint(geometry, point, DEFAULT_PRESSURE),
	);
	const inside = (mask: ObjectPixelMask) =>
		polygonContainsPoint(
			mask.points.map((vertex) =>
				objectPixelMaskCanvasPoint(object, mask, vertex),
			),
			unrotated,
		);
	if (object.pixelClips?.some((mask) => !inside(mask))) return false;
	let removedPointLimit = 0;
	for (const mask of object.pixelCutouts ?? []) {
		if (!inside(mask)) continue;
		if (object.type !== AnnotationObjectTypeId.Stroke) return false;
		removedPointLimit = Math.max(
			removedPointLimit,
			mask.strokePointLimit ?? object.points.length,
		);
	}
	return (
		object.type !== AnnotationObjectTypeId.Stroke ||
		removedPointLimit === 0 ||
		strokeContainsPoint(
			object,
			point,
			strokeTolerance,
			Math.max(0, removedPointLimit - 1),
		)
	);
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
