import type { CropRect, Point } from '../../core/document/appTypes';
import { colorWithAlpha } from '../../core/document/cssColor';
import { type AffineMatrix, IDENTITY_MATRIX, multiplyMatrices, parseTransform, transformPoint } from '../../core/geometry/affineMatrix';
import { type Gradient, GradientKind, type GradientStop, MINIMUM_GRADIENT_STOPS, relativeToFrame } from '../../core/geometry/gradient';
import { type FillPattern, isPatternKind, patternOf } from '../../core/geometry/fillPattern';
import { PatternAttribute } from './svgRecordingContext';
import { elementStyle, INITIAL_SVG_STYLE, SvgKeyword, SvgProperty, type SvgStyle, type SvgStyleSheet, styleNumber, styleOpacity } from './svgStyle';

/**
 * Paint in an SVG: colours, read into the colours the editor keeps, and
 * gradients, read into the editor's gradients, whose points are relative to
 * the item's frame. A paint the editor cannot keep exactly is unsupported,
 * so the importer keeps that element as a picture instead.
 */

export const PaintKind = { None: 'none', Color: 'color', Gradient: 'gradient', Pattern: 'pattern', Unsupported: 'unsupported' } as const;

interface SvgGradientBase {
	readonly stops: readonly GradientStop[];
	/** Whether its coordinates are fractions of the element's box, SVG's default, rather than the element's own units. */
	readonly boundingBox: boolean;
	readonly transform: AffineMatrix;
}

/** An SVG gradient as a file writes it, before it is laid over an item: a linear one's line, or a radial one's centre and radius. */
export type SvgGradient =
	| (SvgGradientBase & { readonly kind: typeof GradientKind.Linear; readonly from: Point; readonly to: Point })
	| (SvgGradientBase & { readonly kind: typeof GradientKind.Radial; readonly centre: Point; readonly radius: number });

export type Paint =
	| { readonly kind: typeof PaintKind.None }
	| { readonly kind: typeof PaintKind.Color; readonly color: string; readonly alpha: number }
	| { readonly kind: typeof PaintKind.Gradient; readonly gradient: SvgGradient; readonly color: string }
	/** One of the editor's own patterns, its tile's side in the element's own units. */
	| { readonly kind: typeof PaintKind.Pattern; readonly pattern: FillPattern; readonly color: string }
	| { readonly kind: typeof PaintKind.Unsupported };

const NO_PAINT: Paint = { kind: PaintKind.None };
const UNSUPPORTED_PAINT: Paint = { kind: PaintKind.Unsupported };

const HEX_COLOR = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_COLOR = /^rgba?\(\s*([^)]*)\)$/i;
const PAINT_REFERENCE = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)\s*(.*)$/i;
const TRANSPARENT = 'transparent';
const HEX_RADIX = 16;
const BYTE = 255;
const SHORT_HEX_DIGITS = { Rgb: 3, Rgba: 4 } as const;
const SHORT_HEX_LENGTHS: ReadonlySet<number> = new Set(Object.values(SHORT_HEX_DIGITS));
const RGB_CHANNELS = 3;
const PERCENT = 100;
const HEX_PAIR = 2;
const SpreadMethod = { Pad: 'pad' } as const;
const GradientUnits = { UserSpace: 'userSpaceOnUse' } as const;
const GradientElement = { Linear: 'linearGradient', Radial: 'radialGradient' } as const;
const PATTERN_ELEMENT = 'pattern';
/** How far `href` links between gradients are followed, so a loop in a file cannot hang the import. */
const MAX_GRADIENT_LINKS = 16;

/** A colour as the editor keeps it, `#rrggbb` where it can be, and its own alpha. */
export interface ParsedColor {
	readonly color: string;
	readonly alpha: number;
}

/** A CSS colour; none when the value is not one. Named and other colours are written as the browser writes them. */
export function parseColor(value: string, currentColor = 'black'): ParsedColor | null {
	const text = value.trim();
	const lower = text.toLowerCase();
	if (lower === SvgKeyword.CurrentColor) return parseColor(currentColor);
	if (lower === TRANSPARENT) return { color: '#000000', alpha: 0 };
	const hex = HEX_COLOR.exec(text)?.[1];
	if (hex) return hexColor(hex);
	const rgb = RGB_COLOR.exec(text)?.[1];
	if (rgb) return rgbColor(rgb);
	return namedColor(text);
}

function hexColor(digits: string): ParsedColor {
	const full = SHORT_HEX_LENGTHS.has(digits.length) ? [...digits].map((digit) => digit + digit).join('') : digits;
	const channels = full.match(new RegExp(`.{${HEX_PAIR}}`, 'g'))!.map((pair) => Number.parseInt(pair, HEX_RADIX));
	return { color: hexOf(channels.slice(0, RGB_CHANNELS)), alpha: channels.length > RGB_CHANNELS ? channels[RGB_CHANNELS]! / BYTE : 1 };
}

function rgbColor(text: string): ParsedColor | null {
	const parts = text.split(/[\s,/]+/).filter(Boolean);
	if (parts.length < RGB_CHANNELS) return null;
	const channels = parts.slice(0, RGB_CHANNELS).map((part) => (part.endsWith('%') ? (Number.parseFloat(part) * BYTE) / PERCENT : Number.parseFloat(part)));
	if (!channels.every(Number.isFinite)) return null;
	const alpha = parts[RGB_CHANNELS] === undefined ? 1 : styleNumber(parts[RGB_CHANNELS], 1);
	return { color: hexOf(channels), alpha: Math.min(1, Math.max(0, alpha)) };
}

function hexOf(channels: readonly number[]): string {
	return `#${channels.map((channel) => Math.round(Math.min(BYTE, Math.max(0, channel))).toString(HEX_RADIX).padStart(HEX_PAIR, '0')).join('')}`;
}

/** A named or other CSS colour, as the browser's canvas writes it; kept as written where no canvas can say. */
function namedColor(text: string): ParsedColor | null {
	if (!/^[a-z]+$|^(hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(text)) return null;
	const context = document.createElement('canvas').getContext('2d');
	if (!context) return { color: text, alpha: 1 };
	context.fillStyle = '#000000';
	context.fillStyle = text;
	const written = String(context.fillStyle);
	return written === text ? { color: text, alpha: 1 } : parseColor(written) ?? { color: text, alpha: 1 };
}

/** The element an SVG id names. */
export function elementById(root: Element, id: string): Element | null {
	for (const element of root.getElementsByTagName('*')) if (element.getAttribute('id') === id) return element;
	return null;
}

/** A `fill` or `stroke` value as paint: none, a colour, or a gradient it references. */
export function parsePaint(value: string, style: SvgStyle, root: Element, sheet: SvgStyleSheet): Paint {
	const text = value.trim();
	if (text.toLowerCase() === SvgKeyword.None) return NO_PAINT;
	const reference = PAINT_REFERENCE.exec(text);
	if (!reference) {
		const color = parseColor(text, style[SvgProperty.Color]);
		return color ? { kind: PaintKind.Color, ...color } : UNSUPPORTED_PAINT;
	}
	const [, id = '', fallback = ''] = reference;
	const target = elementById(root, id);
	if (!target) return fallback ? parsePaint(fallback, style, root, sheet) : NO_PAINT;
	if (target.localName === PATTERN_ELEMENT) {
		const pattern = editorPattern(target);
		return pattern ? { kind: PaintKind.Pattern, pattern, color: pattern.color } : UNSUPPORTED_PAINT;
	}
	const gradient = readGradient(target, root, sheet);
	if (!gradient) return UNSUPPORTED_PAINT;
	if (gradient.stops.length === 0) return NO_PAINT;
	// A gradient of one colour is that colour.
	if (gradient.stops.length < MINIMUM_GRADIENT_STOPS) return { kind: PaintKind.Color, color: gradient.stops[0]!.color, alpha: 1 };
	return { kind: PaintKind.Gradient, gradient, color: gradient.stops[0]!.color };
}

/** A pattern Little Image Editor wrote, named by its kind and colours; none for any other pattern. */
function editorPattern(element: Element): FillPattern | null {
	const kind = element.getAttribute(PatternAttribute.Kind);
	const color = element.getAttribute(PatternAttribute.Color);
	const background = element.getAttribute(PatternAttribute.Background) ?? undefined;
	const size = Number(element.getAttribute('width'));
	return isPatternKind(kind) && color && Number.isFinite(size) && size > 0 ? patternOf(kind, color, background, size) : null;
}

/** The gradients `href` links follow from one to the next, the nearest first. */
function gradientChain(element: Element, root: Element): Element[] {
	const chain: Element[] = [];
	let current: Element | null = element;
	while (current && chain.length < MAX_GRADIENT_LINKS && !chain.includes(current)) {
		chain.push(current);
		const link: string | null = current.getAttribute('href') ?? current.getAttribute('xlink:href');
		current = link?.startsWith('#') ? elementById(root, link.slice(1)) : null;
	}
	return chain;
}

/** An attribute from the nearest gradient in the chain that sets it. */
function chainAttribute(chain: readonly Element[], name: string): string | null {
	for (const element of chain) {
		const value = element.getAttribute(name);
		if (value !== null) return value;
	}
	return null;
}

/** An SVG gradient element as a gradient; none for one that repeats or reflects, which the editor's gradients do not. */
function readGradient(element: Element, root: Element, sheet: SvgStyleSheet): SvgGradient | null {
	const kind = element.localName === GradientElement.Linear ? GradientKind.Linear : element.localName === GradientElement.Radial ? GradientKind.Radial : null;
	if (!kind) return null;
	const chain = gradientChain(element, root);
	const spread = chainAttribute(chain, 'spreadMethod');
	const transform = parseTransform(chainAttribute(chain, 'gradientTransform'));
	if ((spread && spread !== SpreadMethod.Pad) || !transform) return null;
	const boundingBox = chainAttribute(chain, 'gradientUnits') !== GradientUnits.UserSpace;
	const withStops = chain.find((gradient) => gradient.getElementsByTagName('stop').length > 0);
	const stops = withStops ? gradientStops(withStops, sheet) : [];
	const coordinate = (name: string, fallback: string) => styleNumber(chainAttribute(chain, name) ?? fallback, 0);
	const base = { stops, boundingBox, transform };
	if (kind === GradientKind.Linear)
		return { ...base, kind, from: { x: coordinate('x1', '0%'), y: coordinate('y1', '0%') }, to: { x: coordinate('x2', '100%'), y: coordinate('y2', '0%') } };
	return { ...base, kind, centre: { x: coordinate('cx', '50%'), y: coordinate('cy', '50%') }, radius: coordinate('r', '50%') };
}

/** A gradient's colour stops, in order and each no earlier than the one before, as SVG reads them. */
function gradientStops(gradient: Element, sheet: SvgStyleSheet): GradientStop[] {
	let previous = 0;
	const gradientStyle = elementStyle(gradient, INITIAL_SVG_STYLE, sheet);
	return [...gradient.getElementsByTagName('stop')].map((stop) => {
		const style = elementStyle(stop, gradientStyle, sheet);
		const offset = Math.max(previous, Math.min(1, Math.max(0, styleNumber(stop.getAttribute('offset') ?? '0', 0))));
		previous = offset;
		const color = parseColor(style[SvgProperty.StopColor], style[SvgProperty.Color]) ?? { color: '#000000', alpha: 1 };
		const alpha = color.alpha * styleOpacity(style[SvgProperty.StopOpacity]);
		return { offset, color: alpha < 1 ? colorWithAlpha(color.color, alpha) : color.color };
	});
}


/**
 * A gradient laid over an item: `box` is the element's own box in its own
 * units, `toDocument` maps its units onto the image, and `toFrame` gives a
 * point on the image relative to the item's frame.
 */
export function itemGradient(gradient: SvgGradient, box: CropRect, toDocument: AffineMatrix, toFrame: (point: Point) => Point): Gradient {
	const space = gradient.boundingBox ? multiplyMatrices([box.width, 0, 0, box.height, box.x, box.y], gradient.transform) : gradient.transform;
	const onImage = (point: Point) => toFrame(transformPoint(multiplyMatrices(toDocument, space), point));
	if (gradient.kind === GradientKind.Linear)
		return { kind: GradientKind.Linear, stops: gradient.stops, start: onImage(gradient.from), end: onImage(gradient.to) };
	const { centre, radius } = gradient;
	return { kind: GradientKind.Radial, stops: gradient.stops, start: onImage(centre), end: onImage({ x: centre.x + radius, y: centre.y }) };
}

/** An item's frame, for relative points: a point on the image as a fraction of the frame, after undoing the item's turn. */
export function frameMapping(frame: CropRect, unturn: AffineMatrix = IDENTITY_MATRIX): (point: Point) => Point {
	return (point) => relativeToFrame(frame, transformPoint(unturn, point));
}
