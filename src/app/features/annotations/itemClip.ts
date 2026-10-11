import type { Point } from '../../core/document/appTypes';
import { degreesToRadians, rotationAbout, transformPoint } from '../../core/geometry/affineMatrix';
import { genericShape } from '../../core/geometry/genericShape';
import { inFrame, relativeToFrame } from '../../core/geometry/gradient';
import { shapeCenter } from '../../core/geometry/shapeTransformHelpers';
import { FillRule, isPathContour, mapPathPoints, type PathContour } from '../../core/geometry/vectorPath';
import type { AnnotationObject, ItemClip } from './annotationTypes';

/**
 * Clips, as SVG's clipPath: an item shows only inside its clip's outline.
 * A clip is kept relative to its item's frame and turned with it, so it
 * follows the item however it is moved, resized or turned.
 */

/** The clip's outline on the image, where it lies for the item as it is now. */
export function clipContours(item: AnnotationObject, clip: ItemClip): PathContour[] {
	const { rect, rotation = 0 } = genericShape(item).geometry;
	const turn = rotationAbout(degreesToRadians(rotation), shapeCenter({ rect }));
	return mapPathPoints(clip.contours, (point) => transformPoint(turn, inFrame(rect, point)));
}

/** A clip for an item from an outline on the image, kept relative to the item's frame. */
export function clipFor(item: AnnotationObject, contours: readonly PathContour[], fillRule: FillRule = FillRule.NonZero): ItemClip {
	const { rect, rotation = 0 } = genericShape(item).geometry;
	const unturn = rotationAbout(-degreesToRadians(rotation), shapeCenter({ rect }));
	const relative = (point: Point) => relativeToFrame(rect, transformPoint(unturn, point));
	return { contours: mapPathPoints(contours, relative), ...(fillRule === FillRule.EvenOdd ? { fillRule } : {}) };
}

/** Whether a value read from a file is a clip: contours, and perhaps a fill rule. */
export function isOptionalItemClip(value: unknown): boolean {
	if (value === undefined) return true;
	if (typeof value !== 'object' || value === null) return false;
	const clip = value as Record<string, unknown>;
	return (
		Array.isArray(clip.contours) &&
		clip.contours.length > 0 &&
		clip.contours.every(isPathContour) &&
		(clip.fillRule === undefined || Object.values(FillRule).some((rule) => rule === clip.fillRule))
	);
}
