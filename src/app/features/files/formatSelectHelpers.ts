import {
	DEFAULT_IMAGE_FORMAT,
	IMAGE_FORMATS,
	imageFormat,
} from '../../core/document/imageFormats';
import { SVG_EXTENSION, SVG_MIME_TYPE } from '../../core/document/svgFormat';
import { PROJECT_EXTENSION, PROJECT_MIME_TYPE } from '../projects/projectTypes';

const RasterFlatteningMessage =
	'Raster formats save a flattened image. Layers remain editable in the open document, but cannot be restored from the saved raster file.';
const SvgDocumentMessage =
	'SVG keeps layers as groups and shapes, paths, lines and text as editable vectors; brush strokes and other pixels are kept as pictures.';

export function populateImageFormatSelect(
	select: HTMLSelectElement,
	selected = DEFAULT_IMAGE_FORMAT.mimeType,
): void {
	select.replaceChildren(
		...IMAGE_FORMATS.map((format) => new Option(format.label, format.mimeType)),
	);
	select.value = imageFormat(selected).mimeType;
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
		new Option(`SVG (.${SVG_EXTENSION}) — editable vectors`, SVG_MIME_TYPE),
		...IMAGE_FORMATS.map(
			(format) =>
				new Option(`${format.label} — flattened image`, format.mimeType),
		),
	);
}

export function documentFileTypeWarning(fileType: string): string {
	if (fileType === PROJECT_MIME_TYPE)
		return `.${PROJECT_EXTENSION} preserves layers, editable objects, and document settings.`;
	return fileType === SVG_MIME_TYPE ? SvgDocumentMessage : RasterFlatteningMessage;
}

export function transparencyWarning(formatValue: string): string {
	const format = imageFormat(formatValue);
	if (format.supportsTransparency)
		return `${format.label} preserves transparent pixels.`;
	return `${format.label} does not support transparency. Transparent pixels will be replaced with white when saved or exported.`;
}
