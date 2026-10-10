import { ImageMimeType } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { ImagePicture } from '../../platform/editorPlatform';
import { canvasContext } from '../../shared/dom/domHelpers';
import { encodeCanvas } from './canvasHelpers';

const NO_IMAGE_MESSAGE = 'No image is open in the editor.';

/**
 * The whole image, every visible layer and object, as a PNG whose longer
 * side is at most `maxSize` pixels; a smaller image keeps its own size.
 */
export async function imagePicture(
	documentModel: CanvasDocument,
	maxSize: number,
): Promise<ImagePicture> {
	if (!documentModel.hasImage) throw new Error(NO_IMAGE_MESSAGE);
	const { width: imageWidth, height: imageHeight } = documentModel;
	const scale = Math.min(1, maxSize / Math.max(imageWidth, imageHeight));
	const picture = document.createElement('canvas');
	picture.width = Math.max(1, Math.round(imageWidth * scale));
	picture.height = Math.max(1, Math.round(imageHeight * scale));
	canvasContext(picture).drawImage(
		documentModel.compositeCanvas(),
		0,
		0,
		picture.width,
		picture.height,
	);
	return {
		png: await encodeCanvas(picture, ImageMimeType.Png),
		width: picture.width,
		height: picture.height,
		imageWidth,
		imageHeight,
	};
}
