import type { CropRect, Point } from '../../core/document/appTypes';
import { ShapeToolId } from '../../core/document/appTypes';
import { svgLength } from '../../core/document/svgImage';
import {
	type AffineMatrix,
	averageScale,
	degreesToRadians,
	type MatrixParts,
	matrixParts,
	rotationAbout,
	transformPoint,
} from '../../core/geometry/affineMatrix';
import type { Gradient } from '../../core/geometry/gradient';
import { type FillPattern, PatternSize } from '../../core/geometry/fillPattern';
import { ColorPalette } from '../../core/document/colorPalette';
import { textFrame, TextShapeMetrics } from '../../core/geometry/textShapeMetrics';
import { FillRule, mapPathPoints, type PathContour, PathDataError, pathBounds, parsePathData } from '../../core/geometry/vectorPath';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type ConnectorAnnotation,
	LineDash,
	type PathAnnotation,
	type ShapeAnnotation,
	type TextAnnotation,
} from '../annotations/annotationTypes';
import { lineEndInset, pathEnds } from '../annotations/arrowHead';
import { LineEnd } from '../annotations/lineEnd';
import { markerLineEnd } from './svgLineEnds';
import { elementById, frameMapping, itemGradient, type Paint, PaintKind, parsePaint, type SvgGradient } from './svgPaint';
import { elementStyle, SvgKeyword, SvgProperty, type SvgStyle, type SvgStyleSheet, styleNumber, styleOpacity } from './svgStyle';

/**
 * SVG elements as the editor's items: a `rect` is a rectangle and a `circle`
 * or an `ellipse` an ellipse, turned as the file turns them; a `path` or a
 * `polygon` is a path, a `line` or a `polyline` a line with its ends, `text`
 * is text and an `image` a picture item. What an item cannot be exactly, such
 * as a skewed shape, becomes a path; what no item can be is a picture.
 */

export const ElementOutcome = { Items: 'items', Picture: 'picture', Image: 'image', Nothing: 'nothing' } as const;

/** An embedded picture to decode: its data, its box in its own units, how it fits the box, and where its units go. */
export interface SvgImagePlacement {
	readonly href: string;
	readonly box: CropRect;
	/** Whether it keeps its proportions, centred in its box, as SVG's default does; otherwise it fills the box. */
	readonly keepsProportions: boolean;
	readonly matrix: AffineMatrix;
	readonly visible: boolean;
}

/** What an element becomes: items, a picture of itself, an embedded picture to decode, or nothing to show. */
export type ElementResult =
	| { readonly kind: typeof ElementOutcome.Items; readonly items: readonly AnnotationObject[] }
	| { readonly kind: typeof ElementOutcome.Picture }
	| { readonly kind: typeof ElementOutcome.Image; readonly image: SvgImagePlacement }
	| { readonly kind: typeof ElementOutcome.Nothing };

const PICTURE: ElementResult = { kind: ElementOutcome.Picture };
const NOTHING: ElementResult = { kind: ElementOutcome.Nothing };

/** What every element is read with: the file, its style sheet, and the size its percentages are of. */
export interface SvgReadingContext {
	readonly root: Element;
	readonly sheet: SvgStyleSheet;
	readonly viewport: Readonly<{ width: number; height: number }>;
}

/** Where an element is: its style, the transform from its units onto the image, the fading its groups give it, and whether it shows. */
export interface ElementPlacement {
	readonly style: SvgStyle;
	readonly matrix: AffineMatrix;
	readonly opacity: number;
	readonly visible: boolean;
}

/** An SVG element's name, for the elements import reads. */
export const SvgElementName = {
	Rect: 'rect',
	Circle: 'circle',
	Ellipse: 'ellipse',
	Line: 'line',
	Polyline: 'polyline',
	Polygon: 'polygon',
	Path: 'path',
	Text: 'text',
	Tspan: 'tspan',
	Image: 'image',
} as const;

type ElementReader = (element: Element, placement: ElementPlacement, context: SvgReadingContext) => ElementResult;

const HALF = 2;
/** Turns smaller than this are rounding. */
const TURN_TOLERANCE = 1e-6;
const OPACITY_TOLERANCE = 1e-3;
/** Line widths and text sizes are kept to the precision SVG files write them at, without the rounding a transform adds. */
const SIZE_PRECISION = 3;
const PRESERVE_ASPECT_RATIO_NONE = 'none';
const DEFAULT_PRESERVE_ASPECT_RATIO = 'xMidYMid';
const PRESERVE_ASPECT_RATIO_MEET = 'meet';
const PRESERVE_SPACE = 'preserve';
const PRE_WHITE_SPACE = /^pre/;
const POINT_NUMBERS = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
const MARKER_REFERENCE = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/i;
const TextAnchor = { Middle: 'middle', End: 'end' } as const;
/** How far along its width text is placed from its anchor point. */
const ANCHOR_SHARE: Readonly<Record<string, number>> = { [TextAnchor.Middle]: 0.5, [TextAnchor.End]: 1 };

const ELEMENT_READERS: Readonly<Record<string, ElementReader>> = {
	[SvgElementName.Rect]: readRect,
	[SvgElementName.Circle]: readCircle,
	[SvgElementName.Ellipse]: readEllipse,
	[SvgElementName.Line]: readLine,
	[SvgElementName.Polyline]: readPolyline,
	[SvgElementName.Polygon]: readPolygon,
	[SvgElementName.Path]: readPath,
	[SvgElementName.Text]: readText,
	[SvgElementName.Image]: readImage,
};

/** Whether an element is one import reads as an item. */
export function isItemElement(element: Element): boolean {
	return element.localName in ELEMENT_READERS;
}

/** One element as the items it becomes. */
export function readElement(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	const reader = ELEMENT_READERS[element.localName];
	return reader ? reader(element, placement, context) : NOTHING;
}

/** A length attribute in the element's units; `axis` says what a percentage is of. */
function length(element: Element, name: string, context: SvgReadingContext, axis: 'width' | 'height' | 'diagonal', fallback = 0): number {
	const { width, height } = context.viewport;
	const reference = axis === 'diagonal' ? Math.hypot(width, height) / Math.SQRT2 : context.viewport[axis];
	return svgLength(element.getAttribute(name), reference) ?? fallback;
}

function items(...objects: AnnotationObject[]): ElementResult {
	return { kind: ElementOutcome.Items, items: objects };
}

function hidden(placement: ElementPlacement): Partial<Pick<ShapeAnnotation, 'visible'>> {
	return placement.visible ? {} : { visible: false };
}

function tidySize(size: number): number {
	return Number(size.toFixed(SIZE_PRECISION));
}

/** Degrees, with rounding left out so an unturned item stays unturned. */
function turnOf(parts: MatrixParts): number {
	return Math.abs(parts.rotation) < TURN_TOLERANCE ? 0 : parts.rotation;
}

// Paint

/** How an item is painted: its fill and line, its fading, the line's width and whether it is dashed. */
interface ItemPaint {
	readonly fill: Paint;
	readonly stroke: Paint;
	readonly opacity: number;
	readonly width: number;
	readonly dash: LineDash;
	readonly fillRule: FillRule;
}

/** An item's paint; none when its fill and its line fade differently, which an item's one opacity cannot keep. */
function itemPaint(placement: ElementPlacement, context: SvgReadingContext, element: Element): ItemPaint | null {
	const { style } = placement;
	const width = tidySize(styleLength(style[SvgProperty.StrokeWidth], context) * averageScale(placement.matrix));
	const fill = parsePaint(style[SvgProperty.Fill], style, context.root, context.sheet);
	const strokePaint = parsePaint(style[SvgProperty.Stroke], style, context.root, context.sheet);
	const stroke = width > 0 ? strokePaint : { kind: PaintKind.None };
	// Lines are never patterned in the editor, so a patterned line is kept as a picture.
	if (fill.kind === PaintKind.Unsupported || stroke.kind === PaintKind.Unsupported || stroke.kind === PaintKind.Pattern) return null;
	const fillAlpha = paintAlpha(fill) * styleOpacity(style[SvgProperty.FillOpacity]);
	const strokeAlpha = paintAlpha(stroke) * styleOpacity(style[SvgProperty.StrokeOpacity]);
	const filled = fill.kind !== PaintKind.None;
	const stroked = stroke.kind !== PaintKind.None;
	if (filled && stroked && Math.abs(fillAlpha - strokeAlpha) > OPACITY_TOLERANCE) return null;
	const alpha = filled ? fillAlpha : stroked ? strokeAlpha : 1;
	return {
		fill: fill.kind === PaintKind.Pattern ? { ...fill, pattern: scaledPattern(fill.pattern, placement.matrix) } : fill,
		stroke,
		opacity: placement.opacity * alpha,
		width,
		dash: style[SvgProperty.StrokeDasharray].trim().toLowerCase() === SvgKeyword.None ? LineDash.Solid : LineDash.Dashed,
		fillRule: (element.getAttribute('fill-rule') ?? style[SvgProperty.FillRule]).trim() === FillRule.EvenOdd ? FillRule.EvenOdd : FillRule.NonZero,
	};
}

function paintAlpha(paint: Paint): number {
	return paint.kind === PaintKind.Color ? paint.alpha : 1;
}

function styleLength(value: string, context: SvgReadingContext): number {
	const { width, height } = context.viewport;
	return svgLength(value.trim(), Math.hypot(width, height) / Math.SQRT2) ?? styleNumber(value, 1);
}

/** A pattern's tile scaled as the element is, within the sizes a pattern can have. */
function scaledPattern(pattern: FillPattern, matrix: AffineMatrix): FillPattern {
	return { ...pattern, size: Math.min(PatternSize.Maximum, Math.max(PatternSize.Minimum, tidySize(pattern.size * averageScale(matrix)))) };
}

/** The fields an item's paint gives it. */
type PaintedFields = Pick<ShapeAnnotation, 'color' | 'fill' | 'fillColor' | 'fillGradient' | 'fillPattern' | 'lineGradient' | 'width'>;

/** A paint's colour, and its gradient laid over the item or its pattern when it is one. */
function paintParts(paint: Paint, gradientOf: (gradient: SvgGradient) => Gradient): { color: string; gradient?: Gradient; pattern?: FillPattern } {
	if (paint.kind === PaintKind.Gradient) return { color: paint.color, gradient: gradientOf(paint.gradient) };
	if (paint.kind === PaintKind.Pattern) return { color: paint.color, pattern: paint.pattern };
	return { color: paint.kind === PaintKind.Color ? paint.color : ColorPalette.Black };
}

/** A fill's own fields: its gradient, its pattern, or its colour. */
function ownFill(fill: { color: string; gradient?: Gradient; pattern?: FillPattern }): Pick<PaintedFields, 'fillColor' | 'fillGradient' | 'fillPattern'> {
	if (fill.gradient) return { fillGradient: fill.gradient };
	return fill.pattern ? { fillPattern: fill.pattern } : { fillColor: fill.color };
}

/**
 * An item's colours. A fill without a line is the item's colour alone, with
 * no line drawn; a line with a fill keeps the fill as its own colour.
 */
function paintedFields(paint: ItemPaint, gradientOf: (gradient: SvgGradient) => Gradient): PaintedFields | null {
	const filled = paint.fill.kind !== PaintKind.None;
	const stroked = paint.stroke.kind !== PaintKind.None;
	if (!filled && !stroked) return null;
	const fill = filled ? paintParts(paint.fill, gradientOf) : null;
	const line = stroked ? paintParts(paint.stroke, gradientOf) : null;
	if (fill && !line) {
		// A fill of one colour alone is the item's colour; a gradient or pattern is its own fill.
		const own = ownFill(fill);
		return { fill: true, color: fill.color, width: 0, ...('fillColor' in own ? {} : own) };
	}
	return {
		fill: fill !== null,
		color: line!.color,
		width: paint.width,
		...(line!.gradient ? { lineGradient: line!.gradient } : {}),
		...(fill ? ownFill(fill) : {}),
	};
}

// Line ends

/** An element's line ends from its markers; none when a marker is not one of the editor's ends, or it has markers along the way. */
function lineEnds(style: SvgStyle, context: SvgReadingContext): { head?: LineEnd; tail?: LineEnd } | null {
	if (style[SvgProperty.MarkerMid].trim().toLowerCase() !== SvgKeyword.None) return null;
	const head = markerEnd(style[SvgProperty.MarkerEnd], context);
	const tail = markerEnd(style[SvgProperty.MarkerStart], context);
	if (head === null || tail === null) return null;
	return { ...(head ? { head } : {}), ...(tail ? { tail } : {}) };
}

/** The end a marker property names: nothing for none, null for a marker the editor has no end for. */
function markerEnd(value: string, context: SvgReadingContext): LineEnd | undefined | null {
	if (value.trim().toLowerCase() === SvgKeyword.None) return undefined;
	const id = MARKER_REFERENCE.exec(value.trim())?.[1];
	return id ? markerLineEnd(elementById(context.root, id)) : null;
}

// Shapes

function readRect(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	const { box, radius } = rectGeometry(element, context);
	if (box.width <= 0 || box.height <= 0) return NOTHING;
	if (radius.x > 0 && radius.y > 0) return pathItem(roundedRectContours(box, radius), box, placement, context, element);
	return boxShape(ShapeToolId.Rectangle, box, rectContours(box), placement, context, element);
}

/** A rectangle's box and corner radii, in its own units. */
function rectGeometry(element: Element, context: SvgReadingContext): { box: CropRect; radius: Point } {
	const box = {
		x: length(element, 'x', context, 'width'),
		y: length(element, 'y', context, 'height'),
		width: length(element, 'width', context, 'width'),
		height: length(element, 'height', context, 'height'),
	};
	return { box, radius: cornerRadius(element, box, context) };
}

/** A circle's or an ellipse's centre and radii, in its own units. */
interface EllipseGeometry {
	readonly cx: number;
	readonly cy: number;
	readonly rx: number;
	readonly ry: number;
}

function circleGeometry(element: Element, context: SvgReadingContext): EllipseGeometry {
	const r = length(element, 'r', context, 'diagonal');
	return { cx: length(element, 'cx', context, 'width'), cy: length(element, 'cy', context, 'height'), rx: r, ry: r };
}

function ellipseGeometry(element: Element, context: SvgReadingContext): EllipseGeometry {
	const rx = svgLength(element.getAttribute('rx'), context.viewport.width);
	const ry = svgLength(element.getAttribute('ry'), context.viewport.height);
	return { cx: length(element, 'cx', context, 'width'), cy: length(element, 'cy', context, 'height'), rx: rx ?? ry ?? 0, ry: ry ?? rx ?? 0 };
}

function ellipseContours({ cx, cy, rx, ry }: EllipseGeometry): PathContour[] {
	return parsePathData(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
}

/**
 * A shape element's outline in its own units, as a clip uses it; none for an
 * element that is not a shape, or whose outline cannot be read.
 */
export function elementOutline(element: Element, context: SvgReadingContext): PathContour[] | null {
	const outline = OUTLINE_READERS[element.localName]?.(element, context);
	return outline?.length ? outline : null;
}

const OUTLINE_READERS: Readonly<Record<string, (element: Element, context: SvgReadingContext) => PathContour[]>> = {
	[SvgElementName.Rect]: (element, context) => {
		const { box, radius } = rectGeometry(element, context);
		if (box.width <= 0 || box.height <= 0) return [];
		return radius.x > 0 && radius.y > 0 ? roundedRectContours(box, radius) : rectContours(box);
	},
	[SvgElementName.Circle]: (element, context) => ellipseOutline(circleGeometry(element, context)),
	[SvgElementName.Ellipse]: (element, context) => ellipseOutline(ellipseGeometry(element, context)),
	[SvgElementName.Polygon]: (element) => [{ nodes: pointList(element).map((point) => ({ point })), closed: true }],
	[SvgElementName.Path]: (element) => {
		try {
			return parsePathData(element.getAttribute('d') ?? '');
		} catch (error) {
			if (error instanceof PathDataError) return [];
			throw error;
		}
	},
};

function ellipseOutline(geometry: EllipseGeometry): PathContour[] {
	return geometry.rx > 0 && geometry.ry > 0 ? ellipseContours(geometry) : [];
}

/** A rectangle's corner radii, one taken from the other when only one is given, and at most half its sides. */
function cornerRadius(element: Element, box: CropRect, context: SvgReadingContext): Point {
	const rx = svgLength(element.getAttribute('rx'), context.viewport.width);
	const ry = svgLength(element.getAttribute('ry'), context.viewport.height);
	return { x: Math.min(box.width / HALF, Math.max(0, rx ?? ry ?? 0)), y: Math.min(box.height / HALF, Math.max(0, ry ?? rx ?? 0)) };
}

function readCircle(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	return ellipseShape(circleGeometry(element, context), placement, context, element);
}

function readEllipse(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	return ellipseShape(ellipseGeometry(element, context), placement, context, element);
}

function ellipseShape(geometry: EllipseGeometry, placement: ElementPlacement, context: SvgReadingContext, element: Element): ElementResult {
	const { cx, cy, rx, ry } = geometry;
	if (rx <= 0 || ry <= 0) return NOTHING;
	const box = { x: cx - rx, y: cy - ry, width: rx * HALF, height: ry * HALF };
	return boxShape(ShapeToolId.Ellipse, box, ellipseContours(geometry), placement, context, element);
}

function rectContours({ x, y, width, height }: CropRect): PathContour[] {
	return parsePathData(`M${x} ${y}H${x + width}V${y + height}H${x}Z`);
}

function roundedRectContours({ x, y, width, height }: CropRect, { x: rx, y: ry }: Point): PathContour[] {
	const arc = (toX: number, toY: number) => `A${rx} ${ry} 0 0 1 ${toX} ${toY}`;
	return parsePathData(
		`M${x + rx} ${y}H${x + width - rx}${arc(x + width, y + ry)}V${y + height - ry}${arc(x + width - rx, y + height)}H${x + rx}${arc(x, y + height - ry)}V${y + ry}${arc(x + rx, y)}Z`,
	);
}

/**
 * A rectangle or an ellipse as a shape, turned and sized as its transform
 * turns and scales it; skewed or dashed, which a shape cannot be, as a path.
 */
function boxShape(
	shape: typeof ShapeToolId.Rectangle | typeof ShapeToolId.Ellipse,
	box: CropRect,
	contours: PathContour[],
	placement: ElementPlacement,
	context: SvgReadingContext,
	element: Element,
): ElementResult {
	const parts = matrixParts(placement.matrix);
	const paint = itemPaint(placement, context, element);
	if (!paint) return PICTURE;
	if (parts.skewed || paint.dash === LineDash.Dashed) return pathItem(contours, box, placement, context, element);
	const centre = transformPoint(placement.matrix, { x: box.x + box.width / HALF, y: box.y + box.height / HALF });
	const width = box.width * Math.abs(parts.scaleX);
	const height = box.height * Math.abs(parts.scaleY);
	const rect = { x: centre.x - width / HALF, y: centre.y - height / HALF, width, height };
	const rotation = turnOf(parts);
	const unturn = rotationAbout(-degreesToRadians(rotation), centre);
	const painted = paintedFields(paint, (gradient) => itemGradient(gradient, box, placement.matrix, frameMapping(rect, unturn)));
	if (!painted) return NOTHING;
	return items({
		id: crypto.randomUUID(),
		type: AnnotationObjectTypeId.Shape,
		shape,
		rect,
		...(rotation ? { rotation } : {}),
		opacity: paint.opacity,
		...painted,
		...hidden(placement),
	});
}

// Paths and lines

function readPath(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	let contours: PathContour[];
	try {
		contours = parsePathData(element.getAttribute('d') ?? '');
	} catch (error) {
		if (error instanceof PathDataError) return PICTURE;
		throw error;
	}
	return contours.length ? pathItem(contours, pathBounds(contours), placement, context, element) : NOTHING;
}

function readPolygon(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	const points = pointList(element);
	if (points.length < HALF) return NOTHING;
	const contours = [{ nodes: points.map((point) => ({ point })), closed: true }];
	return pathItem(contours, pathBounds(contours), placement, context, element);
}

function readLine(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	const from = { x: length(element, 'x1', context, 'width'), y: length(element, 'y1', context, 'height') };
	const to = { x: length(element, 'x2', context, 'width'), y: length(element, 'y2', context, 'height') };
	// A line has no inside, so SVG never fills it.
	return lineItem([from, to], { ...placement, style: { ...placement.style, [SvgProperty.Fill]: SvgKeyword.None } }, context, element);
}

function readPolyline(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	return lineItem(pointList(element), placement, context, element);
}

/** A `points` attribute as points; an odd number left over is ignored, as SVG does. */
function pointList(element: Element): Point[] {
	const numbers = (element.getAttribute('points') ?? '').match(POINT_NUMBERS)?.map(Number) ?? [];
	const points: Point[] = [];
	for (let index = 0; index + 1 < numbers.length; index += HALF) points.push({ x: numbers[index]!, y: numbers[index + 1]! });
	return points;
}

/**
 * A path, its points carried onto the image. A filled path whose contours
 * are all open is filled as SVG fills it, closed, when it has no line.
 */
function pathItem(local: PathContour[], box: CropRect, placement: ElementPlacement, context: SvgReadingContext, element: Element): ElementResult {
	const paint = itemPaint(placement, context, element);
	const ends = lineEnds(placement.style, context);
	if (!paint || !ends) return PICTURE;
	const filled = paint.fill.kind !== PaintKind.None;
	const stroked = paint.stroke.kind !== PaintKind.None;
	const allOpen = local.every(({ closed }) => !closed);
	if (filled && allOpen && stroked) return PICTURE;
	const contours = mapPathPoints(filled && allOpen ? local.map((contour) => ({ ...contour, closed: true })) : local, (point) => transformPoint(placement.matrix, point));
	if ((ends.head || ends.tail) && !pathEnds(contours)) return PICTURE;
	const painted = paintedFields(paint, (gradient) => itemGradient(gradient, box, placement.matrix, frameMapping(pathBounds(contours))));
	if (!painted) return NOTHING;
	const path: PathAnnotation = {
		id: crypto.randomUUID(),
		type: AnnotationObjectTypeId.Path,
		contours,
		...painted,
		opacity: paint.opacity,
		dash: paint.dash,
		...(paint.fillRule === FillRule.EvenOdd ? { fillRule: FillRule.EvenOdd } : {}),
		...ends,
		...hidden(placement),
	};
	return items(path);
}

/**
 * A line or polyline as a line with ends. Its ends' tips are where its
 * markers point; a hollow end's line stops at its back, as the editor draws it.
 */
function lineItem(local: Point[], placement: ElementPlacement, context: SvgReadingContext, element: Element): ElementResult {
	if (local.length < HALF) return NOTHING;
	const paint = itemPaint(placement, context, element);
	if (!paint) return PICTURE;
	const contour = { nodes: local.map((point) => ({ point })), closed: false };
	// A filled or gradient line is a path, which can be either.
	if (paint.fill.kind !== PaintKind.None || paint.stroke.kind === PaintKind.Gradient) return pathItem([contour], pathBounds([contour]), placement, context, element);
	if (paint.stroke.kind !== PaintKind.Color) return NOTHING;
	const ends = lineEnds(placement.style, context);
	if (!ends) return PICTURE;
	const points = local.map((point) => transformPoint(placement.matrix, point));
	const connector: ConnectorAnnotation = {
		id: crypto.randomUUID(),
		type: AnnotationObjectTypeId.Connector,
		points: withTips(points, paint.width, ends),
		color: paint.stroke.color,
		width: paint.width,
		opacity: paint.opacity,
		arrow: false,
		dash: paint.dash,
		...ends,
		...hidden(placement),
	};
	return items(connector);
}

/** A line's points with each hollow end's tip put back where the line was pulled back from it. */
function withTips(points: Point[], width: number, { head = LineEnd.None, tail = LineEnd.None }: { head?: LineEnd; tail?: LineEnd }): Point[] {
	const result = [...points];
	result[result.length - 1] = extended(result.at(-2)!, result.at(-1)!, lineEndInset(width, head));
	result[0] = extended(result[1]!, result[0]!, lineEndInset(width, tail));
	return result;
}

/** A point moved `distance` further from `from`, along the line through both. */
function extended(from: Point, to: Point, distance: number): Point {
	const span = Math.hypot(to.x - from.x, to.y - from.y);
	if (!distance || !span) return to;
	return { x: to.x + ((to.x - from.x) * distance) / span, y: to.y + ((to.y - from.y) * distance) / span };
}

// Text

/** One line of text: what it says, where its baseline starts in the element's units, and its own style. */
interface TextLine {
	readonly text: string;
	readonly at: Point;
	readonly style: SvgStyle;
	readonly fitWidth?: number;
}

/**
 * Text as text items, one for each line placed on its own. Only plain filled
 * text fully shown is text; outlined, faded or skewed text is a picture.
 */
function readText(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	const parts = matrixParts(placement.matrix);
	if (parts.skewed || parts.scaleY < 0) return PICTURE;
	const lines = textLines(element, placement.style, context);
	const texts: TextAnnotation[] = [];
	for (const line of lines) {
		const text = textItem(line, placement, context, parts);
		if (text === null) return PICTURE;
		if (text) texts.push(text);
	}
	return texts.length ? items(...texts) : NOTHING;
}

/** The lines of a text element: one for the element, and one more for each `tspan` placed on its own. */
function textLines(element: Element, style: SvgStyle, context: SvgReadingContext): TextLine[] {
	const preserve = element.getAttribute('xml:space') === PRESERVE_SPACE || PRE_WHITE_SPACE.test(style[SvgProperty.WhiteSpace]);
	const tidy = (text: string) => (preserve ? text : text.replace(/\s+/g, ' ').trim());
	const origin = { x: length(element, 'x', context, 'width'), y: length(element, 'y', context, 'height') };
	const fit = svgLength(element.getAttribute('textLength'), context.viewport.width) ?? undefined;
	const lines: TextLine[] = [];
	let current = { text: '', at: origin, style };
	for (const node of element.childNodes) {
		const span = placedSpan(node);
		if (span) {
			lines.push(current);
			current = { text: span.textContent ?? '', at: spanStart(span, current.at, context), style: elementStyle(span, style, context.sheet) };
		} else current = { ...current, text: current.text + (node.textContent ?? '') };
	}
	lines.push(current);
	return lines.map((line) => ({ ...line, text: tidy(line.text), ...(fit !== undefined && lines.length === 1 ? { fitWidth: fit } : {}) })).filter(({ text }) => text.length > 0);
}

/** A `tspan` placed on its own, which starts a line. */
function placedSpan(node: Node): Element | null {
	const span = node instanceof Element && node.localName === SvgElementName.Tspan ? node : null;
	return span && (span.hasAttribute('x') || span.hasAttribute('y')) ? span : null;
}

/** Where a placed `tspan` starts: where it says, and where the line before was on the side it leaves out. */
function spanStart(span: Element, previous: Point, context: SvgReadingContext): Point {
	return {
		x: span.hasAttribute('x') ? length(span, 'x', context, 'width') : previous.x,
		y: span.hasAttribute('y') ? length(span, 'y', context, 'height') : previous.y,
	};
}

/** One line of text as a text item; nothing when it shows nothing, and null when only a picture can keep it. */
function textItem(line: TextLine, placement: ElementPlacement, context: SvgReadingContext, parts: MatrixParts): TextAnnotation | undefined | null {
	const { style } = line;
	const fill = parsePaint(style[SvgProperty.Fill], style, context.root, context.sheet);
	const stroke = parsePaint(style[SvgProperty.Stroke], style, context.root, context.sheet);
	if (stroke.kind !== PaintKind.None) return null;
	if (fill.kind === PaintKind.None) return undefined;
	if (fill.kind !== PaintKind.Color) return null;
	if (placement.opacity * fill.alpha * styleOpacity(style[SvgProperty.FillOpacity]) < 1 - OPACITY_TOLERANCE) return null;
	const scale = averageScale(placement.matrix);
	const size = tidySize(styleNumber(style[SvgProperty.FontSize], TextShapeMetrics.MinimumFontSize) * scale);
	const width = line.fitWidth === undefined ? textFrame(line.at, line.text, size).width : line.fitWidth * scale;
	const shift = ((ANCHOR_SHARE[style[SvgProperty.TextAnchor].trim()] ?? 0) * width) / scale;
	const baseline = transformPoint(placement.matrix, { x: line.at.x - shift, y: line.at.y });
	const rotation = turnOf(parts);
	const at = unturnedTextStart(baseline, width, size, rotation);
	return {
		id: crypto.randomUUID(),
		type: AnnotationObjectTypeId.Text,
		at,
		text: line.text,
		color: fill.color,
		size,
		...(rotation ? { rotation } : {}),
		...(line.fitWidth === undefined ? {} : { rect: { x: at.x, y: at.y - size, width, height: size * TextShapeMetrics.LineHeight } }),
		...hidden(placement),
	};
}

/**
 * Where text starts before its turn: text turns about its frame's centre, so
 * the start is found from where its baseline starts once turned.
 */
function unturnedTextStart(baseline: Point, width: number, size: number, rotation: number): Point {
	if (!rotation) return baseline;
	// The start's offset from the frame's centre, which the turn carries round.
	const offset = { x: -width / HALF, y: size - (size * TextShapeMetrics.LineHeight) / HALF };
	const turned = transformPoint(rotationAbout(degreesToRadians(rotation), { x: 0, y: 0 }), offset);
	const centre = { x: baseline.x - turned.x, y: baseline.y - turned.y };
	return { x: centre.x + offset.x, y: centre.y + offset.y };
}

// Pictures

/**
 * An embedded picture, decoded later. Only one fitted as SVG fits pictures
 * by default, or filling its box, and neither skewed, mirrored nor faded, is a
 * picture item; anything else is drawn as SVG draws it.
 */
function readImage(element: Element, placement: ElementPlacement, context: SvgReadingContext): ElementResult {
	const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');
	if (!href) return NOTHING;
	const fit = pictureFit(element);
	const box = {
		x: length(element, 'x', context, 'width'),
		y: length(element, 'y', context, 'height'),
		width: length(element, 'width', context, 'width'),
		height: length(element, 'height', context, 'height'),
	};
	if (fit === null || box.width <= 0 || box.height <= 0 || !placesAsItem(placement)) return PICTURE;
	return { kind: ElementOutcome.Image, image: { href, box, keepsProportions: fit.keepsProportions, matrix: placement.matrix, visible: placement.visible } };
}

/** How a picture fits its box: filling it, or centred keeping its proportions; null for any other fit. */
function pictureFit(element: Element): { keepsProportions: boolean } | null {
	const [align, scaling = PRESERVE_ASPECT_RATIO_MEET] = (element.getAttribute('preserveAspectRatio') ?? DEFAULT_PRESERVE_ASPECT_RATIO).trim().split(/\s+/);
	if (align === PRESERVE_ASPECT_RATIO_NONE) return { keepsProportions: false };
	return align === DEFAULT_PRESERVE_ASPECT_RATIO && scaling === PRESERVE_ASPECT_RATIO_MEET ? { keepsProportions: true } : null;
}

/** Whether a picture item can be placed this way: turned and scaled, but not skewed, mirrored or faded. */
function placesAsItem(placement: ElementPlacement): boolean {
	const parts = matrixParts(placement.matrix);
	return !parts.skewed && parts.scaleX > 0 && parts.scaleY > 0 && placement.opacity >= 1 - OPACITY_TOLERANCE;
}

/** Where a picture of the given size goes on the image: its frame and its turn, fitted into its box as it asks. */
export function placedPictureFrame(placement: SvgImagePlacement, picture: Readonly<{ width: number; height: number }>): { rect: CropRect; rotation: number } {
	const { box } = placement;
	const fitScale = placement.keepsProportions ? Math.min(box.width / picture.width, box.height / picture.height) : 0;
	const fitted = placement.keepsProportions
		? { x: box.x + (box.width - picture.width * fitScale) / HALF, y: box.y + (box.height - picture.height * fitScale) / HALF, width: picture.width * fitScale, height: picture.height * fitScale }
		: box;
	const parts = matrixParts(placement.matrix);
	const centre = transformPoint(placement.matrix, { x: fitted.x + fitted.width / HALF, y: fitted.y + fitted.height / HALF });
	const width = fitted.width * Math.abs(parts.scaleX);
	const height = fitted.height * Math.abs(parts.scaleY);
	return { rect: { x: centre.x - width / HALF, y: centre.y - height / HALF, width, height }, rotation: turnOf(parts) };
}
