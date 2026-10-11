import { transformPoint } from '../../core/geometry/affineMatrix';
import { FillRule, mapPathPoints, type PathContour, parsePathData } from '../../core/geometry/vectorPath';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import { type AnnotationObject, AnnotationObjectTypeId, LineDash, type PathAnnotation, type ShapeAnnotation } from '../annotations/annotationTypes';
import { clipContours, clipFor } from '../annotations/itemClip';
import { ColorPalette } from '../../core/document/colorPalette';
import { asCanvasContext, SvgRecordingContext } from '../files/svgRecordingContext';

/**
 * Clipping, as SVG's clipPath: a shape or path directly above an item, in
 * the same layer, becomes the item's clip, so the item shows only inside it.
 * Releasing the clip gives its outline back as a path above the item.
 */

/** The outline a released clip is drawn with, until restyled. */
const RELEASED_CLIP_STYLE = { color: ColorPalette.Black, width: 1, opacity: 1 } as const;
/** A recording needs a size, though an outline does not depend on it. */
const OUTLINE_CANVAS = { width: 1, height: 1 } as const;

type Outline = ShapeAnnotation | PathAnnotation;

/** The shape or path directly above an item in its layer, which can clip it. */
export function clippingShapeAbove(objects: AnnotationDocument, item: Readonly<AnnotationObject>): Outline | null {
	const layer = objects.layerOf(item.id);
	if (!layer) return null;
	const above = objects.object(layer.itemIds[layer.itemIds.indexOf(item.id) + 1] ?? null);
	if (above?.type !== AnnotationObjectTypeId.Shape && above?.type !== AnnotationObjectTypeId.Path) return null;
	return outlineOf(above).length ? above : null;
}

/** Clips the selected item with the shape above it, in one step; the shape becomes the clip. */
export function clipWithShapeAbove(objects: AnnotationDocument): void {
	const item = objects.selected;
	const shape = item ? clippingShapeAbove(objects, item) : null;
	if (!item || !shape) return;
	const rule = shape.type === AnnotationObjectTypeId.Path ? (shape.fillRule ?? FillRule.NonZero) : FillRule.NonZero;
	objects.transact(() => {
		objects.update(item.id, (target) => {
			target.clip = clipFor(target, outlineOf(shape), rule);
		}, false);
		objects.remove(shape.id);
		objects.select(item.id);
	});
}

/** Releases the selected item's clip, giving its outline back as a path just above the item. */
export function releaseClip(objects: AnnotationDocument): void {
	const item = objects.selected;
	const layer = item ? objects.layerOf(item.id) : null;
	if (!item?.clip || !layer) return;
	const clip = item.clip;
	const outline: PathAnnotation = {
		id: crypto.randomUUID(),
		type: AnnotationObjectTypeId.Path,
		contours: clipContours(item, clip),
		...RELEASED_CLIP_STYLE,
		fill: false,
		dash: LineDash.Solid,
		...(clip.fillRule ? { fillRule: clip.fillRule } : {}),
	};
	objects.transact(() => {
		objects.update(item.id, (target) => {
			Reflect.deleteProperty(target, 'clip');
		}, false);
		objects.insertItem(outline, layer.id, layer.itemIds.indexOf(item.id) + 1);
		objects.select(item.id);
	});
}

/**
 * A shape's or path's outline on the image, taken from the editor's own
 * drawing of its fill, turned as it is turned.
 */
export function outlineOf(shape: Readonly<Outline>): PathContour[] {
	const recorder = new SvgRecordingContext(OUTLINE_CANVAS, '');
	const plain = { ...shape, fill: true, width: 0, effects: undefined, clip: undefined, fillGradient: undefined, fillPattern: undefined };
	renderAnnotationObject(asCanvasContext(recorder), document.createElement('canvas'), plain);
	return recorder.filledPaths.flatMap(({ data, matrix }) => mapPathPoints(parsePathData(data), (point) => transformPoint(matrix, point)));
}
