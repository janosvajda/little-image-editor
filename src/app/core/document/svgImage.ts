import { MAX_CANVAS_DIMENSION } from '../geometry/geometryHelpers';
import { MeasurementUnitId, PIXELS_PER_INCH, PIXELS_PER_UNIT } from './measurementUnits';
import { SVG_MIME_TYPE } from './svgFormat';

export { isSvgFile, isSvgFileName, SVG_EXTENSION, SVG_MIME_TYPE } from './svgFormat';

/**
 * SVG images, opened as pictures: the browser draws them, at the size the
 * file asks for, into the canvas like any other image. Their content is made
 * safe first, so nothing in a file runs or reaches outside it.
 */


export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const PARSER_ERROR = 'parsererror';
const INVALID_SVG_MESSAGE = 'The file is not a valid SVG image.';
/** Without a width, height or viewBox, an SVG image is drawn at the size the web gives a replaced element. */
export const SvgDefaultSize = { Width: 300, Height: 150 } as const;
const POINTS_PER_INCH = 72;
const PICAS_PER_INCH = 6;
/** Pixels per unit of every absolute length an SVG size may be written in. */
const PIXELS_PER_SVG_UNIT: Readonly<Record<string, number>> = {
	'': 1,
	[MeasurementUnitId.Pixel]: PIXELS_PER_UNIT[MeasurementUnitId.Pixel],
	[MeasurementUnitId.Millimetre]: PIXELS_PER_UNIT[MeasurementUnitId.Millimetre],
	[MeasurementUnitId.Centimetre]: PIXELS_PER_UNIT[MeasurementUnitId.Centimetre],
	[MeasurementUnitId.Inch]: PIXELS_PER_UNIT[MeasurementUnitId.Inch],
	pt: PIXELS_PER_INCH / POINTS_PER_INCH,
	pc: PIXELS_PER_INCH / PICAS_PER_INCH,
};
const LENGTH = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i;
const SIGNED_LENGTH = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*|%)\s*$/i;
const PERCENT_SIGN = '%';
const PERCENT = 100;
const VIEW_BOX_PARTS = 4;
/** Elements that could run code or show a page inside the picture. */
const UNSAFE_ELEMENTS = ['script', 'foreignObject', 'iframe', 'object', 'embed'] as const;
const EVENT_ATTRIBUTE = /^on/i;
const HREF_ATTRIBUTES = ['href', 'xlink:href'] as const;
/** References inside the file, or data it carries itself; anything else would reach outside. */
const SAFE_REFERENCE = /^(#|data:)/i;

export interface SvgSize {
	readonly width: number;
	readonly height: number;
}

/** Reads an SVG image: the document, made safe and set to draw at the size it asks for. */
export function readSvg(source: string): { readonly svg: string; readonly size: SvgSize } {
	const { root, size } = safeSvg(source);
	return { svg: new XMLSerializer().serializeToString(root), size };
}

/**
 * An SVG document's root, made safe and set to draw at the size it asks for,
 * scaled to fit a canvas when larger; its viewBox keeps its own coordinates.
 */
export function safeSvg(source: string): { readonly root: Element; readonly size: SvgSize } {
	const document = new DOMParser().parseFromString(source, SVG_MIME_TYPE);
	const root = document.documentElement;
	if (root.namespaceURI !== SVG_NAMESPACE || document.getElementsByTagName(PARSER_ERROR).length)
		throw new Error(INVALID_SVG_MESSAGE);
	makeSafe(root);
	const requested = svgSize(root);
	const size = withinCanvas(requested);
	// Drawn at its own size, scaled to fit the canvas when larger, the picture keeps its proportions.
	if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${requested.width} ${requested.height}`);
	root.setAttribute('width', String(size.width));
	root.setAttribute('height', String(size.height));
	return { root, size };
}

/** The size an SVG asks to be drawn at: its width and height, otherwise its viewBox, otherwise the web's default. */
export function svgSize(root: Element): SvgSize {
	const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
	const box = viewBox.length === VIEW_BOX_PARTS && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0
		? { width: viewBox[2]!, height: viewBox[3]! }
		: null;
	const width = pixelLength(root.getAttribute('width'));
	const height = pixelLength(root.getAttribute('height'));
	if (width && height) return { width, height };
	if (box && width) return { width, height: (width * box.height) / box.width };
	if (box && height) return { width: (height * box.width) / box.height, height };
	return box ?? { width: width ?? SvgDefaultSize.Width, height: height ?? SvgDefaultSize.Height };
}

/** An absolute length in pixels; a percentage or another relative length has none. */
export function pixelLength(value: string | null): number | null {
	const match = value ? LENGTH.exec(value) : null;
	const perUnit = match ? PIXELS_PER_SVG_UNIT[match[2]!.toLowerCase()] : undefined;
	const length = match && perUnit ? Number(match[1]) * perUnit : 0;
	return length > 0 ? length : null;
}

/**
 * A coordinate or length in an SVG's own units: a plain number, an absolute
 * length, or a percentage of `percentOf`; none when it is not one.
 */
export function svgLength(value: string | null, percentOf: number): number | null {
	const match = value === null ? null : SIGNED_LENGTH.exec(value);
	if (!match) return null;
	const number = Number(match[1]);
	const unit = match[2]!.toLowerCase();
	if (unit === PERCENT_SIGN) return (number * percentOf) / PERCENT;
	const perUnit = PIXELS_PER_SVG_UNIT[unit];
	return perUnit === undefined ? null : number * perUnit;
}

/** Whole pixels, at least one, and no side longer than a canvas can be. */
function withinCanvas({ width, height }: SvgSize): SvgSize {
	const scale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Removes what could run code or load something from elsewhere, keeping everything that is only drawing. */
function makeSafe(root: Element): void {
	for (const name of UNSAFE_ELEMENTS) for (const element of [...root.getElementsByTagName(name)]) element.remove();
	for (const element of [root, ...root.getElementsByTagName('*')]) {
		removeEventHandlers(element);
		removeOutsideReferences(element);
	}
}

function removeEventHandlers(element: Element): void {
	for (const { name } of [...element.attributes]) if (EVENT_ATTRIBUTE.test(name)) element.removeAttribute(name);
}

/** Links to anything outside the file, which a picture must not load. */
function removeOutsideReferences(element: Element): void {
	const outside = (reference: string | null) => reference !== null && !SAFE_REFERENCE.test(reference.trim());
	for (const name of HREF_ATTRIBUTES) if (outside(element.getAttribute(name))) element.removeAttribute(name);
	if (outside(element.getAttributeNS(XLINK_NAMESPACE, 'href'))) element.removeAttributeNS(XLINK_NAMESPACE, 'href');
}

/** Draws an SVG image file as a picture at the size it asks for. */
export async function decodeSvg(file: Blob): Promise<{ readonly image: HTMLImageElement; readonly size: SvgSize }> {
	const { svg, size } = readSvg(await file.text());
	return { image: await svgPicture(svg, size), size };
}

/** Safe SVG markup drawn by the browser as a picture of the given size. */
export async function svgPicture(markup: string, size: SvgSize): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(new Blob([markup], { type: SVG_MIME_TYPE }));
	try {
		const image = new Image(size.width, size.height);
		image.src = url;
		await image.decode();
		return image;
	} catch {
		throw new Error(INVALID_SVG_MESSAGE);
	} finally {
		URL.revokeObjectURL(url);
	}
}
