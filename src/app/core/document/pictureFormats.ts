import { imageFormatOfFileName } from './imageFormats';
import { isSvgFileName } from './svgFormat';

/** Whether a file name is a picture the editor reads: one of the image formats, or SVG. Needs no browser. */
export function isPictureFileName(fileName: string): boolean {
	return isSvgFileName(fileName) || imageFormatOfFileName(fileName) !== null;
}
