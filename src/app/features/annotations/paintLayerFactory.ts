import { PaintToolId } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { encodePixelBytes } from '../../shared/image/pixelDataCodec';
import type { ExtractedPixelFragment } from '../drawing/pixelCutMove';
import {
	AnnotationObjectTypeId,
	type RasterFragmentAnnotation,
	type StrokeAnnotation,
} from './annotationTypes';

const EmptyStrokeGeometry = {
	x: 0,
	y: 0,
	width: 0,
	height: 0,
} as const;

const EmptyStrokeDefault = {
	Size: 1,
	Opacity: 1,
	Hardness: 1,
	Seed: 0,
} as const;

/** A stroke item with no points yet; a paint gesture fills in its style and path. */
export function createEmptyStroke(): StrokeAnnotation {
	return {
		id: crypto.randomUUID(),
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [],
		pathStarts: [],
		pathStyles: [],
		sourceRect: { ...EmptyStrokeGeometry },
		rect: { ...EmptyStrokeGeometry },
		color: ColorPalette.Black,
		size: EmptyStrokeDefault.Size,
		opacity: EmptyStrokeDefault.Opacity,
		hardness: EmptyStrokeDefault.Hardness,
		seed: EmptyStrokeDefault.Seed,
		rotation: 0,
	};
}

/** A pixel item holding exactly the given pixels at their document position. */
export function createRasterFragmentItem(
	fragment: ExtractedPixelFragment,
): RasterFragmentAnnotation {
	const { left, top, width, height } = fragment.bounds;
	return {
		id: crypto.randomUUID(),
		type: AnnotationObjectTypeId.RasterFragment,
		rect: { x: left, y: top, width, height },
		pixelWidth: width,
		pixelHeight: height,
		pixels: encodePixelBytes(fragment.pixels),
		rotation: 0,
	};
}
