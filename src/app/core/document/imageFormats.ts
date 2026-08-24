import { ImageMimeType, type ImageFormat } from './appTypes';

export interface ImageFormatDefinition {
	readonly mimeType: ImageFormat;
	readonly label: string;
	readonly extensions: readonly string[];
	readonly supportsTransparency: boolean;
	readonly quality?: number;
}

export const ImageFormatLabel = {
	Png: 'PNG',
	Jpeg: 'JPEG',
	Webp: 'WebP',
} as const;
export const ImageExtension = {
	Png: 'png',
	Jpeg: 'jpg',
	JpegAlternative: 'jpeg',
	Webp: 'webp',
} as const;
const DEFAULT_LOSSY_QUALITY = 0.92;

export const IMAGE_FORMATS: readonly ImageFormatDefinition[] = [
	{
		mimeType: ImageMimeType.Png,
		label: ImageFormatLabel.Png,
		extensions: [ImageExtension.Png],
		supportsTransparency: true,
	},
	{
		mimeType: ImageMimeType.Jpeg,
		label: ImageFormatLabel.Jpeg,
		extensions: [ImageExtension.Jpeg, ImageExtension.JpegAlternative],
		supportsTransparency: false,
		quality: DEFAULT_LOSSY_QUALITY,
	},
	{
		mimeType: ImageMimeType.Webp,
		label: ImageFormatLabel.Webp,
		extensions: [ImageExtension.Webp],
		supportsTransparency: true,
		quality: DEFAULT_LOSSY_QUALITY,
	},
];

export const DEFAULT_IMAGE_FORMAT = IMAGE_FORMATS[0]!;

export function imageFormat(mimeType: string): ImageFormatDefinition {
	return (
		IMAGE_FORMATS.find((format) => format.mimeType === mimeType) ??
		DEFAULT_IMAGE_FORMAT
	);
}

export function isImageFormat(value: string): value is ImageFormat {
	return IMAGE_FORMATS.some((format) => format.mimeType === value);
}
