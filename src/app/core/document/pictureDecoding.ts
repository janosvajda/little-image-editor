import { isSvgFile } from './svgFormat';
import { decodeSvg } from './svgImage';

/** An image file decoded into something to draw, with its size. */
export interface DecodedPicture {
	readonly source: CanvasImageSource;
	readonly width: number;
	readonly height: number;
	/** Whether it came from a vector file, drawn at the size the file asks for. */
	readonly vector: boolean;
	/** Frees what decoding held, once the picture has been drawn. */
	release(): void;
}

/** An image file as something to draw: raster formats decoded by the browser, SVG drawn at the size it asks for. */
export async function decodedPicture(file: Blob & Partial<Pick<File, 'name'>>): Promise<DecodedPicture> {
	if (isSvgFile({ type: file.type, name: file.name ?? '' })) {
		const { image, size } = await decodeSvg(file);
		return { source: image, ...size, vector: true, release: () => undefined };
	}
	const bitmap = await createImageBitmap(file);
	return { source: bitmap, width: bitmap.width, height: bitmap.height, vector: false, release: () => bitmap.close() };
}
