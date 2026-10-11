import type { ImageFormat } from '../../core/document/appTypes';
import { IMAGE_FORMATS, imageFormat, imageFormatOfFileName } from '../../core/document/imageFormats';
import { isSvgFileName, SVG_EXTENSION, SVG_MIME_TYPE } from '../../core/document/svgFormat';
import type { PickerFileType } from '../../platform/editorPlatform';
import {
	PROJECT_EXTENSION,
	PROJECT_MIME_TYPE,
} from '../projects/projectTypes';

const PROJECT_FILE_SUFFIX = `.${PROJECT_EXTENSION}`;

const SVG_FILE_SUFFIX = `.${SVG_EXTENSION}`;

/** Every picture the editor reads: the image formats and SVG images. */
const PICTURE_TYPES = [...IMAGE_FORMATS.map((format) => format.mimeType), SVG_MIME_TYPE, SVG_FILE_SUFFIX];

/** What Place image accepts: pictures, not projects. */
export const PICTURE_FILE_ACCEPT = PICTURE_TYPES.join(',');

/** What Open accepts: pictures and projects. */
export const EDITOR_OPEN_FILE_ACCEPT = [...PICTURE_TYPES, PROJECT_FILE_SUFFIX, PROJECT_MIME_TYPE].join(',');

export function isProjectFile(file: File): boolean {
	return file.type === PROJECT_MIME_TYPE || isProjectFileName(file.name);
}

/** The type of a file by its name: an image format's, an SVG image's, or a project's otherwise. */
export function fileTypeOfName(fileName: string): string {
	if (isSvgFileName(fileName)) return SVG_MIME_TYPE;
	return imageFormatOfFileName(fileName)?.mimeType ?? PROJECT_MIME_TYPE;
}

export function isProjectFileName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(PROJECT_FILE_SUFFIX);
}

/** The project type in a file picker. */
export const PROJECT_PICKER_TYPE: PickerFileType = {
	description: 'Little Image Editor project',
	accept: { [PROJECT_MIME_TYPE]: [PROJECT_FILE_SUFFIX] },
};

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

/** A format a document can be saved in as an image of its own: one of the image formats, or SVG. */
export type ImageSaveFormat = ImageFormat | typeof SVG_MIME_TYPE;

/** What Save As offers: the suggested format first, then the image formats, SVG, and a project. */
export function savePickerTypes(suggested: ImageSaveFormat): readonly PickerFileType[] {
	const images = IMAGE_FORMATS.filter(({ mimeType }) => mimeType !== suggested).map(({ mimeType }) => imagePickerType(mimeType));
	return suggested === SVG_MIME_TYPE
		? [SVG_PICKER_TYPE, ...images, PROJECT_PICKER_TYPE]
		: [imagePickerType(suggested), ...images, SVG_PICKER_TYPE, PROJECT_PICKER_TYPE];
}

/** Whether a file name says what to save: a project, an SVG, or one of the image formats. */
export function isSavableFileName(fileName: string): boolean {
	return isProjectFileName(fileName) || isSvgFileName(fileName) || imageFormatOfFileName(fileName) !== null;
}

/**
 * Everything Open accepts, in a file picker. The first type is what the
 * picker shows at first, and some pickers, such as macOS's, grey out files
 * of the other types until the user switches; so it holds images and
 * projects together, and each kind follows on its own for filtering.
 */
export const EDITOR_OPEN_PICKER_TYPES: readonly PickerFileType[] = [
	{ description: 'Images and projects', accept: { ...IMAGE_PICKER_ACCEPT, ...PROJECT_PICKER_TYPE.accept } },
	{ description: 'Images', accept: IMAGE_PICKER_ACCEPT },
	PROJECT_PICKER_TYPE,
];
