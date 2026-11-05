import type { Point } from '../../core/document/appTypes';
import { degreesToRadians, rotationAbout, transformPoint } from '../../core/geometry/affineMatrix';
import { inFrame, relativeToFrame } from '../../core/geometry/gradient';
import { genericShape } from '../../core/geometry/genericShape';
import { pointInShapeFrame, shapeCenter, type TransformableGeometry } from '../../core/geometry/shapeTransformHelpers';
import { Numeric } from '../../shared/math/numericConstants';
import type { AnnotationObject } from '../annotations/annotationTypes';

/**
 * An item's pivot, the point it turns and scales about, like Flash's
 * transform point. It is kept in the item's own frame, from 0 to 1 on each
 * side as its clip and gradients are, so it moves, stretches and turns with
 * the item. Without one, an item pivots about its frame's centre.
 */

export const DEFAULT_PIVOT: Point = { x: 0.5, y: 0.5 };

/** The item's pivot in its frame. */
export function itemPivot(item: Pick<AnnotationObject, 'pivot'>): Point {
	return item.pivot ?? DEFAULT_PIVOT;
}

/** Where a pivot lies on the image, the frame's rotation included. */
export function pivotPoint(geometry: TransformableGeometry, pivot: Point): Point {
	return transformPoint(rotationAbout(degreesToRadians(geometry.rotation ?? 0), shapeCenter(geometry)), inFrame(geometry.rect, pivot));
}

/** Where an item's pivot lies on the image. */
export function itemPivotPoint(item: AnnotationObject): Point {
	return pivotPoint(genericShape(item).geometry, itemPivot(item));
}

/** The pivot that lies at an image point, in the frame's own terms. */
export function pivotAt(geometry: TransformableGeometry, point: Point): Point {
	return relativeToFrame(geometry.rect, pointInShapeFrame(geometry, point));
}

/**
 * The frame of a given size and rotation whose pivot lies at `point`: the
 * frame turns about its centre, so its centre is found from the pivot back.
 */
export function frameAroundPivot(size: Readonly<{ width: number; height: number }>, rotation: number, pivot: Point, point: Point): TransformableGeometry {
	const offset = { x: (pivot.x - DEFAULT_PIVOT.x) * size.width, y: (pivot.y - DEFAULT_PIVOT.y) * size.height };
	const turned = transformPoint(rotationAbout(degreesToRadians(rotation), { x: 0, y: 0 }), offset);
	const center = { x: point.x - turned.x, y: point.y - turned.y };
	return { rect: { x: center.x - size.width / Numeric.HalfDivisor, y: center.y - size.height / Numeric.HalfDivisor, width: size.width, height: size.height }, rotation };
}

/** Gives an item a pivot, keeping none for the default one. */
export function setItemPivot(item: Pick<AnnotationObject, 'pivot'>, pivot: Point): void {
	item.pivot = isDefaultPivot(pivot) ? undefined : pivot;
}

/** Whether a pivot is the default one, so it need not be kept. */
export function isDefaultPivot(pivot: Point): boolean {
	return pivot.x === DEFAULT_PIVOT.x && pivot.y === DEFAULT_PIVOT.y;
}
