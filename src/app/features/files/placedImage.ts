import type { CropRect, Point } from '../../core/document/appTypes';
import { decodedPicture } from '../../core/document/pictureDecoding';
import { MAX_CANVAS_DIMENSION } from '../../core/geometry/geometryHelpers';
import { canvasContext } from '../../shared/dom/domHelpers';
import type { RasterFragmentAnnotation } from '../annotations/annotationTypes';
import { createRasterFragmentItem } from '../annotations/paintLayerFactory';
import type { ExtractedPixelFragment } from '../drawing/pixelCutMove';

/**
 * A picture placed on an open image: it becomes a pixel item on a layer,
 * keeping all its pixels, so it can be moved, resized, turned, faded and
 * erased like a cut-out. Shared by Place image… and by assistants.
 */

/** Where a placed picture goes and how big it is; it is centred and fitted when either is left out. */
export interface ImagePlacement {
	/** Its top left corner. */
	readonly at?: Point;
	/** Its width; the height follows its proportions unless given too. */
	readonly width?: number;
	readonly height?: number;
}

export interface ImageSize {
	readonly width: number;
	readonly height: number;
}

/** A larger picture is fitted to cover at most this share of the image, so it can be seen whole and grabbed. */
const FIT_SHARE = 0.8;
const HALF = 2;

/** A pixel item of an image file, at full resolution up to the largest canvas, placed on an image of the given size. */
export async function placedImageItem(file: Blob & Partial<Pick<File, 'name'>>, image: ImageSize, placement: ImagePlacement = {}): Promise<RasterFragmentAnnotation> {
	const fragment = await pictureFragment(file);
	return createRasterFragmentItem(fragment, placedRect(fragment.bounds, image, placement));
}

/** An image file's pixels, at full resolution up to the largest canvas. */
export async function pictureFragment(file: Blob & Partial<Pick<File, 'name'>>): Promise<ExtractedPixelFragment> {
	const picture = await decodedPicture(file);
	try {
		const scale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(picture.width, picture.height));
		const width = Math.max(1, Math.round(picture.width * scale));
		const height = Math.max(1, Math.round(picture.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvasContext(canvas);
		context.drawImage(picture.source, 0, 0, width, height);
		const pixels = context.getImageData(0, 0, width, height).data;
		return { bounds: { left: 0, top: 0, right: width, bottom: height, width, height }, pixels };
	} finally {
		picture.release();
	}
}

/** Where a picture of this size goes: as placed, or centred and fitted inside the image when larger than it fits. */
export function placedRect(picture: ImageSize, image: ImageSize, placement: ImagePlacement = {}): CropRect {
	const fit = Math.min(1, (image.width * FIT_SHARE) / picture.width, (image.height * FIT_SHARE) / picture.height);
	const width = placement.width ?? (placement.height ? (placement.height * picture.width) / picture.height : picture.width * fit);
	const height = placement.height ?? (width * picture.height) / picture.width;
	const at = placement.at ?? { x: (image.width - width) / HALF, y: (image.height - height) / HALF };
	return { x: Math.round(at.x), y: Math.round(at.y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}
