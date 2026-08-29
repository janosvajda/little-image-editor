import {
	DEFAULT_IMAGE_FORMAT,
	IMAGE_FORMATS,
	imageFormat,
} from '../../core/document/imageFormats';
import { PROJECT_EXTENSION, PROJECT_MIME_TYPE } from '../projects/projectTypes';

export type SaveFileType =
	| (typeof IMAGE_FORMATS)[number]['mimeType']
	| typeof PROJECT_MIME_TYPE;

const RasterFlatteningMessage =
	'Raster formats save a flattened image. Layers remain editable in the open document, but cannot be restored from the saved raster file.';

export function populateImageFormatSelect(
	select: HTMLSelectElement,
	selected = DEFAULT_IMAGE_FORMAT.mimeType,
): void {
	select.replaceChildren(
		...IMAGE_FORMATS.map((format) => new Option(format.label, format.mimeType)),
	);
	select.value = imageFormat(selected).mimeType;
}

export function populateSaveFileTypeSelect(
	select: HTMLSelectElement,
	selected: SaveFileType = DEFAULT_IMAGE_FORMAT.mimeType,
): void {
	select.replaceChildren(
		new Option(`Little Image Editor (.${PROJECT_EXTENSION})`, PROJECT_MIME_TYPE),
		...IMAGE_FORMATS.map((format) => new Option(format.label, format.mimeType)),
	);
	select.value = selected;
}

export function isProjectFileType(value: string): value is typeof PROJECT_MIME_TYPE {
	return value === PROJECT_MIME_TYPE;
}

export function isImageFileType(value: string): value is (typeof IMAGE_FORMATS)[number]['mimeType'] {
	return IMAGE_FORMATS.some((format) => format.mimeType === value);
}

export function populateDocumentFileTypeSelect(select: HTMLSelectElement): void {
	select.replaceChildren(
		new Option(
			`Little Image Editor (.${PROJECT_EXTENSION}) — preserves layers`,
			PROJECT_MIME_TYPE,
			true,
			true,
		),
		...IMAGE_FORMATS.map(
			(format) =>
				new Option(`${format.label} — flattened image`, format.mimeType),
		),
	);
}

export function documentFileTypeWarning(fileType: string): string {
	if (fileType === PROJECT_MIME_TYPE)
		return `.${PROJECT_EXTENSION} preserves layers, editable objects, and document settings.`;
	return RasterFlatteningMessage;
}

export function transparencyWarning(formatValue: string): string {
	const format = imageFormat(formatValue);
	if (format.supportsTransparency)
		return `${format.label} preserves transparent pixels.`;
	return `${format.label} does not support transparency. Transparent pixels will be replaced with white when saved or exported.`;
}
