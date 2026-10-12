import type { ImageFormat } from '../../core/document/appTypes';
import { IMAGE_FORMATS, imageFormat, imageFormatOfFileName } from '../../core/document/imageFormats';
import { isSvgFileName, SVG_EXTENSION, SVG_MIME_TYPE } from '../../core/document/svgFormat';
import type { PickerFileType } from '../../platform/editorPlatform';
const SVG_FILE_SUFFIX = `.${SVG_EXTENSION}`;

/** Every picture the editor reads: the image formats and SVG images. */
const PICTURE_TYPES = [...IMAGE_FORMATS.map((format) => format.mimeType), SVG_MIME_TYPE, SVG_FILE_SUFFIX];

/** What Place image accepts: pictures. */
export const PICTURE_FILE_ACCEPT = PICTURE_TYPES.join(',');

/** What Open accepts: the same pictures, an SVG opening as its editable document. */
export const EDITOR_OPEN_FILE_ACCEPT = PICTURE_FILE_ACCEPT;

/** The type a File has when its kind is not known, as a browser leaves it. */
const UNKNOWN_FILE_TYPE = '';

/** The type of a file by its name: an image format's or an SVG image's; unknown otherwise. */
export function fileTypeOfName(fileName: string): string {
	if (isSvgFileName(fileName)) return SVG_MIME_TYPE;
	return imageFormatOfFileName(fileName)?.mimeType ?? UNKNOWN_FILE_TYPE;
}

const IMAGE_PICKER_ACCEPT: PickerFileType['accept'] = {
	...Object.fromEntries(IMAGE_FORMATS.map(({ mimeType, extensions }) => [mimeType, extensions.map((extension) => `.${extension}`)])),
	[SVG_MIME_TYPE]: [SVG_FILE_SUFFIX],
};

/** One image format in a file picker. */
export function imagePickerType(type: ImageFormat): PickerFileType {
	const { label, extensions } = imageFormat(type);
	return { description: `${label} image`, accept: { [type]: extensions.map((extension) => `.${extension}`) } };
}

/** SVG in a file picker. */
export const SVG_PICKER_TYPE: PickerFileType = {
	description: 'SVG image',
	accept: { [SVG_MIME_TYPE]: [SVG_FILE_SUFFIX] },
};

/** Whether a file name says what to save: an SVG, or one of the image formats. */
export function isSavableFileName(fileName: string): boolean {
	return isSvgFileName(fileName) || imageFormatOfFileName(fileName) !== null;
}

/** Everything Open accepts, in a file picker: images, SVG among them. */
export const EDITOR_OPEN_PICKER_TYPES: readonly PickerFileType[] = [{ description: 'Images', accept: IMAGE_PICKER_ACCEPT }];
