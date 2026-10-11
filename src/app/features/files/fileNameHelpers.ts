import type { ImageFormat } from '../../core/document/appTypes';
import { imageFormat } from '../../core/document/imageFormats';

/** The name a file gets when it has none. */
const DEFAULT_FILE_NAME = 'little-image';

export function preferredExtension(type: ImageFormat): string {
	return imageFormat(type).extensions[0]!;
}

export function hasValidExtension(
	fileName: string,
	type: ImageFormat,
): boolean {
	const extension = fileName
		.trim()
		.toLowerCase()
		.match(/\.([^.]+)$/)?.[1];
	return (
		extension !== undefined && imageFormat(type).extensions.includes(extension)
	);
}

export function ensureImageExtension(
	fileName: string,
	type: ImageFormat,
): string {
	const trimmed = fileName.trim() || DEFAULT_FILE_NAME;
	return hasValidExtension(trimmed, type) ? trimmed : ensureExtension(trimmed, preferredExtension(type));
}

/** A file name ending in the extension, replacing any other one it ends in. */
export function ensureExtension(fileName: string, extension: string): string {
	const trimmed = fileName.trim() || DEFAULT_FILE_NAME;
	if (trimmed.toLowerCase().endsWith(`.${extension}`)) return trimmed;
	const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
	const lastDot = trimmed.lastIndexOf('.');
	const baseName = lastDot > lastSlash ? trimmed.slice(0, lastDot) : trimmed;
	return `${baseName}.${extension}`;
}
