import type { ImageFormat } from '../../core/document/appTypes';
import { imageFormat } from '../../core/document/imageFormats';

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
	const trimmed = fileName.trim() || 'little-image';
	if (hasValidExtension(trimmed, type)) return trimmed;
	const extension = preferredExtension(type);
	const lastSlash = Math.max(
		trimmed.lastIndexOf('/'),
		trimmed.lastIndexOf('\\'),
	);
	const lastDot = trimmed.lastIndexOf('.');
	const baseName = lastDot > lastSlash ? trimmed.slice(0, lastDot) : trimmed;
	return `${baseName}.${extension}`;
}
