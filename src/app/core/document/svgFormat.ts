/** SVG as a file format: its type and name, which need no browser to check. */

export const SVG_MIME_TYPE = 'image/svg+xml';
export const SVG_EXTENSION = 'svg';

export function isSvgFile(file: Pick<File, 'type' | 'name'>): boolean {
	return file.type === SVG_MIME_TYPE || isSvgFileName(file.name);
}

export function isSvgFileName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(`.${SVG_EXTENSION}`);
}
