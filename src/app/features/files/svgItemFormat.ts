import type { CropRect } from '../../core/document/appTypes';
import { svgNumber } from './svgRecordingContext';

/**
 * How the editor's own items are kept in an SVG, as Inkscape keeps its own:
 * each item is a group around its drawing, which any SVG viewer shows as it
 * is, named by a `data-item` attribute. Geometry is read back from the drawing
 * itself; the group carries only what SVG has no way to say, such as a
 * numbered marker being one, or the pressure along a brush stroke.
 */

/** The attributes an item's group, a layer's group and the document can carry. */
export const SvgDataAttribute = {
	Item: 'data-item',
	Locked: 'data-locked',
	Shape: 'data-shape',
	Frame: 'data-frame',
	Flip: 'data-flip',
	/** A colour the drawing does not show, such as a filled shape's undrawn line's. */
	Color: 'data-color',
	/** A width the drawing does not show. */
	Width: 'data-width',
	Opacity: 'data-opacity',
	Blur: 'data-blur',
	Rotation: 'data-rotation',
	NextStep: 'data-next-step',
	/** The document's resolution, in pixels per inch. */
	Resolution: 'data-resolution',
	/** A brush stroke's tool, and the tools of the parts drawn with another. */
	Tool: 'data-tool',
	/** A brush stroke's points with the pressure at each, as `x,y,pressure` triples. */
	Points: 'data-points',
	/** Where a brush stroke's separate pieces start, as point indexes. */
	PathStarts: 'data-path-starts',
	/** The styles of a brush stroke's parts drawn differently, one `;`-separated entry each. */
	Styles: 'data-styles',
	/** The frame a stroke's points were drawn in, before it was resized. */
	SourceFrame: 'data-source-frame',
	Size: 'data-size',
	Hardness: 'data-hardness',
	/** The seed a spray's dots are scattered by, so they scatter the same again. */
	Seed: 'data-seed',
	/** A fill's rows, as `x,y,length` triples. */
	Runs: 'data-runs',
	Tolerance: 'data-tolerance',
	/** An item's eraser strokes, one entry each: size, opacity, hardness, when it was made, then its points. */
	Erasures: 'data-erasures',
	/** Parts cut away from an item, one entry each: when it was made, the frame it was made in, then its outline. */
	Cutouts: 'data-cutouts',
	/** Parts of an item kept by a cut, one entry each, as cut-outs are written. */
	Clips: 'data-clips',
} as const;

/** A word that stands for a value an entry leaves out. */
export const SVG_NONE = '-';
export type SvgDataAttribute = (typeof SvgDataAttribute)[keyof typeof SvgDataAttribute];

/** Which way a shape is mirrored, as `data-flip` writes it. */
export const SvgFlip = { X: 'x', Y: 'y', Both: 'xy' } as const;
export type SvgFlip = (typeof SvgFlip)[keyof typeof SvgFlip];

/** The value a flag attribute has when it is set. */
export const SVG_FLAG = 'true';

export type SvgAttributes = Readonly<Record<string, string | number | undefined>>;

const FRAME_PARTS = 4;
const NUMBERS = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;

/** A frame as `x y width height`. */
export function frameValue({ x, y, width, height }: CropRect): string {
	return [x, y, width, height].map((value) => svgNumber(value)).join(' ');
}

/** A frame from `x y width height`; null when it is not one. */
export function parseFrame(value: string | null): CropRect | null {
	const numbers = numberList(value);
	if (numbers.length !== FRAME_PARTS) return null;
	const [x, y, width, height] = numbers as [number, number, number, number];
	return width >= 0 && height >= 0 ? { x, y, width, height } : null;
}

const TRIPLE = 3;
const TRIPLE_SEPARATOR = ',';
const ENTRY_SEPARATOR = ';';

/** Triples of numbers as SVG writes point lists: `a,b,c a,b,c`. */
export function triplesValue(triples: readonly (readonly [number, number, number])[]): string {
	return triples.map((triple) => triple.map((value) => svgNumber(value)).join(TRIPLE_SEPARATOR)).join(' ');
}

/** Triples from `a,b,c a,b,c`; null when the list is not whole triples. */
export function parseTriples(value: string | null): [number, number, number][] | null {
	const numbers = numberList(value);
	if (!numbers.length || numbers.length % TRIPLE) return null;
	const triples: [number, number, number][] = [];
	for (let index = 0; index < numbers.length; index += TRIPLE) triples.push([numbers[index]!, numbers[index + 1]!, numbers[index + 2]!]);
	return triples;
}

/** Entries of space-separated words, one `;`-separated entry each. */
export function entriesValue(entries: readonly (readonly (string | number)[])[]): string {
	return entries.map((entry) => entry.map((word) => (typeof word === 'number' ? svgNumber(word) : word)).join(' ')).join(`${ENTRY_SEPARATOR} `);
}

export function parseEntries(value: string | null): string[][] {
	return (value ?? '')
		.split(ENTRY_SEPARATOR)
		.map((entry) => entry.trim().split(/\s+/).filter(Boolean))
		.filter((entry) => entry.length > 0);
}

/** The numbers a list attribute holds, in order. */
export function numberList(value: string | null): number[] {
	return (value?.match(NUMBERS) ?? []).map(Number).filter(Number.isFinite);
}

/** A number attribute; undefined when it is absent or not a number. */
export function numberAttribute(element: Element, name: SvgDataAttribute): number | undefined {
	const value = element.getAttribute(name);
	if (value === null || value.trim() === '') return undefined;
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
}

/** Whether a flag attribute is set. */
export function flagAttribute(element: Element, name: SvgDataAttribute): boolean {
	return element.getAttribute(name) === SVG_FLAG;
}

/** A flag attribute's value: set when true, left out otherwise. */
export function flagValue(value: boolean | undefined): string | undefined {
	return value ? SVG_FLAG : undefined;
}
