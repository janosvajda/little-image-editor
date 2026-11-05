import type { Point } from '../../../core/document/appTypes';
import { parseCssColor } from '../../../core/document/cssColor';
import { type AffineMatrix, degreesToRadians, isIdentityMatrix, matrixParts, multiplyMatrices, transformPoint, translation } from '../../../core/geometry/affineMatrix';
import { genericShape } from '../../../core/geometry/genericShape';
import { type PathContour, PathDataError, parsePathData, pathPieces } from '../../../core/geometry/vectorPath';
import { canvasContext } from '../../../shared/dom/domHelpers';
import { renderAnnotationObject } from '../../annotations/annotationRenderer';
import type { AnnotationObject } from '../../annotations/annotationTypes';
import { coveredBounds } from '../../files/svgExport';
import { asCanvasContext, type DrawingCall, DrawingCallKind, PathPaint, RecordedGradient, type RecordedPaint, SvgRecordingContext } from '../../files/svgRecordingContext';
import { itemPivot, pivotPoint } from '../itemPivot';
import {
	type AnimItem,
	AnimItemKind,
	type Contour,
	FileFillRule,
	FontStyle,
	type FontSpec,
	type ImageItem,
	LineCap,
	LineJoin,
	type Paint,
	PaintKind,
	type PathCommand,
	PathCommandName,
	type PathItem,
	type Rgba,
	TextAlign,
	TextBaseline,
	type TextItem,
	type Transform,
} from './animationSchema';

/**
 * An editor item as a file item. The item is laid out in its own frame, at
 * the origin and unturned, and drawn by the editor's own renderer into a
 * recording; what it drew becomes paths, text and pictures, in the frame's
 * coordinates, and the item's transform puts the frame back where it was. An
 * item drawn through anything the file cannot say, such as a mask, a clip, a
 * filter or a pattern, is kept as the picture it draws instead.
 */

/** How a child's id follows its item's: `item:index`. */
export const CHILD_ID_SEPARATOR = ':';
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_TYPE = 'image/png';
/** Room around an item baked as a picture, for what it draws beyond its frame: line widths, shadows and blurs. */
const BAKE_MARGIN = 64;
/** How far a blur or a soft shadow reaches, in its spreads. */
const BLUR_REACH = 3;
const IDENTITY_SCALE = 1;
/** Scales closer than this are the same, after rounding. */
const SCALE_TOLERANCE = 1e-6;

const CANVAS_ALIGN: Readonly<Record<CanvasTextAlign, TextAlign>> = { left: TextAlign.Left, start: TextAlign.Left, center: TextAlign.Center, right: TextAlign.Right, end: TextAlign.Right };
const CANVAS_BASELINE: Readonly<Record<CanvasTextBaseline, TextBaseline>> = {
	alphabetic: TextBaseline.Alphabetic,
	ideographic: TextBaseline.Bottom,
	bottom: TextBaseline.Bottom,
	top: TextBaseline.Top,
	hanging: TextBaseline.Top,
	middle: TextBaseline.Middle,
};
const CANVAS_CAP: Readonly<Record<CanvasLineCap, LineCap>> = { butt: LineCap.Butt, round: LineCap.Round, square: LineCap.Square };
const CANVAS_JOIN: Readonly<Record<CanvasLineJoin, LineJoin>> = { miter: LineJoin.Miter, round: LineJoin.Round, bevel: LineJoin.Bevel };
/** A canvas font: optional style, variant and weight, then the size in pixels, an optional line height, and the family. */
const CANVAS_FONT = /^\s*(?:(italic|oblique|normal)\s+)?(?:(?:normal|small-caps)\s+)?(?:(bold|bolder|lighter|normal|\d{3})\s+)?([\d.]+)px(?:\/\S+)?\s+(.+?)\s*$/i;
const FontWeight = { Normal: 400, Bold: 700 } as const;
const NAMED_WEIGHTS: Readonly<Record<string, number>> = { normal: FontWeight.Normal, bold: FontWeight.Bold, bolder: FontWeight.Bold, lighter: FontWeight.Normal };
const ITALIC_STYLES: ReadonlySet<string> = new Set(['italic', 'oblique']);

/** What converting needs from the document: the stage, which items such as blurs draw from, and its size. */
export interface ItemConversionStage {
	readonly canvas: HTMLCanvasElement;
	readonly width: number;
	readonly height: number;
}

/** The item as a file item, with `editor` as its editing data. */
export function fileItem(item: AnnotationObject, stage: ItemConversionStage, editor: string): AnimItem {
	const geometry = genericShape(item).geometry;
	const pivot = itemPivot(item);
	const frame = { width: geometry.rect.width, height: geometry.rect.height };
	const local = structuredClone(item);
	genericShape(local).setGeometry({ rect: { x: 0, y: 0, ...frame }, rotation: 0 });
	const transform: Transform = {
		...pivotPoint(geometry, pivot),
		rotation: degreesToRadians(geometry.rotation ?? 0),
		scaleX: IDENTITY_SCALE,
		scaleY: IDENTITY_SCALE,
		skewX: 0,
		pivot: { x: pivot.x * frame.width, y: pivot.y * frame.height },
	};
	const base = { id: item.id, transform, visible: item.visible !== false, frame, editor };
	const children = drawnChildren(local, stage) ?? bakedChildren(local, frame, stage);
	return assembled(base, children);
}

/** One child is the item itself; several are its group. A shared opacity is the item's own, so tweens change it. */
function assembled(base: Pick<AnimItem, 'id' | 'transform' | 'visible' | 'frame' | 'editor'>, children: readonly AnimItem[]): AnimItem {
	const [only] = children;
	if (only && children.length === 1 && isIdentityTransform(only.transform)) return { ...only, ...base, opacity: only.opacity };
	const opacity = children.length && children.every((child) => child.opacity === children[0]!.opacity) ? children[0]!.opacity : 1;
	const items = children.map((child, index) => ({ ...child, id: `${base.id}${CHILD_ID_SEPARATOR}${index}`, opacity: opacity === 1 ? child.opacity : 1 }));
	return { ...base, kind: AnimItemKind.Group, opacity, items };
}

/** What the item draws, as paths, text and pictures; null when it draws anything the file cannot say. */
function drawnChildren(item: AnnotationObject, stage: ItemConversionStage): AnimItem[] | null {
	const recorder = new SvgRecordingContext(stage, '');
	renderAnnotationObject(asCanvasContext(recorder), stage.canvas, item);
	const children: AnimItem[] = [];
	for (const call of recorder.drawingCalls) {
		const child = childOf(call, children.at(-1));
		if (!child) return null;
		if (child.merged) children[children.length - 1] = child.item;
		else children.push(child.item);
	}
	return children;
}

type CallOf<Kind extends DrawingCall['kind']> = Extract<DrawingCall, { readonly kind: Kind }>;
/** A child made from a call, and whether it joins the child before it rather than following it. */
type ChildResult = { item: AnimItem; merged: boolean } | null;

/** A drawing call as a child; an outline of the path filled just before it joins that path. */
function childOf(call: DrawingCall, previous: AnimItem | undefined): ChildResult {
	switch (call.kind) {
		case DrawingCallKind.Path:
			return pathCallChild(call, previous);
		case DrawingCallKind.Text:
			return textCallChild(call);
		case DrawingCallKind.Image:
			return imageCallChild(call);
		case DrawingCallKind.Other:
			return null;
	}
}

function pathCallChild(call: CallOf<typeof DrawingCallKind.Path>, previous: AnimItem | undefined): ChildResult {
	const contours = fileContours(call.data, call.matrix);
	const paint = filePaint(call.style, call.matrix);
	if (!paint || !contours) return null;
	if (call.paint === PathPaint.Fill) return { item: pathChild(contours, paint, null, call.fillRule === FileFillRule.EvenOdd ? FileFillRule.EvenOdd : FileFillRule.NonZero, call.alpha), merged: false };
	const scale = uniformScale(call.matrix);
	if (scale === null) return null;
	const stroke = { paint, width: call.line.width * scale, cap: CANVAS_CAP[call.line.cap], join: CANVAS_JOIN[call.line.join], dash: call.line.dash.map((length) => length * scale) };
	const outlinesPrevious = previous?.kind === AnimItemKind.Path && !previous.stroke && previous.opacity === call.alpha && JSON.stringify(previous.contours) === JSON.stringify(contours);
	if (outlinesPrevious) return { item: { ...previous, stroke }, merged: true };
	return { item: pathChild(contours, null, stroke, FileFillRule.NonZero, call.alpha), merged: false };
}

function textCallChild(call: CallOf<typeof DrawingCallKind.Text>): ChildResult {
	const font = fileFont(call.font);
	const color = typeof call.style === 'string' ? parseCssColor(call.style) : null;
	const transform = decomposedTransform(multiplyMatrices(call.matrix, translation(call.x, call.y)));
	if (!font || !color || !transform) return null;
	const text: TextItem = {
		...childBase(transform, call.alpha),
		kind: AnimItemKind.Text,
		text: call.text,
		font,
		color: rgba(color),
		align: CANVAS_ALIGN[call.align],
		baseline: CANVAS_BASELINE[call.baseline],
		...(call.maxWidth === undefined ? {} : { maxWidth: call.maxWidth }),
	};
	return { item: text, merged: false };
}

function imageCallChild(call: CallOf<typeof DrawingCallKind.Image>): ChildResult {
	const transform = decomposedTransform(multiplyMatrices(call.matrix, translation(call.x, call.y)));
	const png = pngOf(call.source);
	if (!call.width || !call.height || !transform || !png) return null;
	const image: ImageItem = { ...childBase(transform, call.alpha), kind: AnimItemKind.Image, width: call.width, height: call.height, png };
	return { item: image, merged: false };
}

function pathChild(contours: Contour[], fill: Paint | null, stroke: PathItem['stroke'], fillRule: PathItem['fillRule'], opacity: number): PathItem {
	return { ...childBase(identityTransform(), opacity), kind: AnimItemKind.Path, contours, fill, fillRule, stroke };
}

/** What every child has; its id is given once its place among its item's children is known. */
function childBase(transform: Transform, opacity: number): Pick<AnimItem, 'id' | 'transform' | 'opacity' | 'visible'> {
	return { id: '', transform, opacity, visible: true };
}

/**
 * The item as the picture it draws, cropped to what it covers, in its frame's
 * coordinates; none when it draws nothing.
 */
function bakedChildren(item: AnnotationObject, frame: Readonly<{ width: number; height: number }>, stage: ItemConversionStage): AnimItem[] {
	const margin = BAKE_MARGIN + effectsReach(item);
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.ceil(frame.width + margin * 2));
	canvas.height = Math.max(1, Math.ceil(frame.height + margin * 2));
	const context = canvasContext(canvas);
	context.translate(margin, margin);
	renderAnnotationObject(context, stage.canvas, item);
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
	const covered = coveredBounds(pixels);
	if (!covered) return [];
	const cropped = document.createElement('canvas');
	cropped.width = covered.width;
	cropped.height = covered.height;
	canvasContext(cropped).drawImage(canvas, covered.x, covered.y, covered.width, covered.height, 0, 0, covered.width, covered.height);
	const png = pngOf(cropped);
	if (!png) return [];
	const transform = { ...identityTransform(), x: covered.x - margin, y: covered.y - margin };
	return [{ ...childBase(transform, 1), kind: AnimItemKind.Image, width: covered.width, height: covered.height, png }];
}

/** How far an item's effects draw beyond it. */
function effectsReach({ effects }: AnnotationObject): number {
	if (!effects) return 0;
	const shadow = effects.shadow ? Math.hypot(effects.shadow.offset.x, effects.shadow.offset.y) + effects.shadow.softness * BLUR_REACH : 0;
	return (effects.blur ?? 0) * BLUR_REACH + shadow;
}

// Geometry

/** SVG path data, mapped by a matrix, as file contours: arcs become cubic curves. Null for data that draws nothing. */
export function fileContours(data: string, matrix: AffineMatrix): Contour[] | null {
	const map = (point: Point) => transformPoint(matrix, point);
	let contours: PathContour[];
	try {
		contours = parsePathData(data);
	} catch (error) {
		if (error instanceof PathDataError) return null;
		throw error;
	}
	return contours.flatMap((contour) => {
		const [first] = contour.nodes;
		if (!first) return [];
		const start = map(first.point);
		const commands: PathCommand[] = [[PathCommandName.Move, start.x, start.y]];
		for (const piece of pathPieces(contour)) {
			const to = map(piece.to);
			if (piece.c1 && piece.c2) {
				const c1 = map(piece.c1);
				const c2 = map(piece.c2);
				commands.push([PathCommandName.Cubic, c1.x, c1.y, c2.x, c2.y, to.x, to.y]);
			} else commands.push([PathCommandName.Line, to.x, to.y]);
		}
		if (contour.closed) commands.push([PathCommandName.Close]);
		return [{ closed: contour.closed, commands }];
	});
}

/** A matrix as a transform with no pivot: translate, rotate, skew along x, then scale; null when it mirrors. */
export function decomposedTransform([a, b, c, d, e, f]: AffineMatrix): Transform | null {
	const scaleX = Math.hypot(a, b);
	if (scaleX === 0) return null;
	const angle = Math.atan2(b, a);
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	const shear = c * cosine + d * sine;
	const scaleY = d * cosine - c * sine;
	if (scaleY <= 0) return null;
	return { x: e, y: f, rotation: angle, scaleX, scaleY, skewX: Math.atan(shear / scaleY), pivot: { x: 0, y: 0 } };
}

function identityTransform(): Transform {
	return { x: 0, y: 0, rotation: 0, scaleX: IDENTITY_SCALE, scaleY: IDENTITY_SCALE, skewX: 0, pivot: { x: 0, y: 0 } };
}

function isIdentityTransform({ x, y, rotation, scaleX, scaleY, skewX, pivot }: Transform): boolean {
	return x === 0 && y === 0 && rotation === 0 && scaleX === IDENTITY_SCALE && scaleY === IDENTITY_SCALE && skewX === 0 && pivot.x === 0 && pivot.y === 0;
}

/** The scale a matrix applies the same way in every direction; null when it stretches or skews. */
function uniformScale(matrix: AffineMatrix): number | null {
	if (isIdentityMatrix(matrix)) return IDENTITY_SCALE;
	const { scaleX, scaleY, skewed } = matrixParts(matrix);
	return !skewed && Math.abs(scaleX - scaleY) < SCALE_TOLERANCE ? scaleX : null;
}

// Paint

/** A canvas paint as a file paint, its points mapped by the matrix; null for one the file cannot say. */
function filePaint(style: RecordedPaint, matrix: AffineMatrix): Paint | null {
	if (typeof style === 'string') {
		const color = parseCssColor(style);
		return color ? { kind: PaintKind.Solid, color: rgba(color) } : null;
	}
	if (!(style instanceof RecordedGradient)) return null;
	const stops = style.stops.map(({ offset, color }) => ({ offset, color: parseCssColor(color) }));
	if (stops.some(({ color }) => !color)) return null;
	const fileStops = stops.map(({ offset, color }) => ({ offset, color: rgba(color!) }));
	const map = (x: number, y: number) => transformPoint(matrix, { x, y });
	const [x0 = 0, y0 = 0, third = 0, fourth = 0, fifth = 0, sixth = 0] = style.coordinates;
	if (style.kind === PaintKind.Linear) return { kind: PaintKind.Linear, stops: fileStops, from: map(x0, y0), to: map(third, fourth) };
	// A file's radial gradient grows from its centre: the inner circle must be the centre point, and a turn or an even scale keeps it a circle.
	const concentric = third === 0 && x0 === fourth && y0 === fifth;
	if (!concentric || uniformScale(matrix) === null) return null;
	return { kind: PaintKind.Radial, stops: fileStops, from: map(x0, y0), to: map(x0 + sixth, y0) };
}

function rgba(color: readonly [number, number, number, number]): Rgba {
	return [color[0], color[1], color[2], color[3]];
}

/** A canvas font as a file font; null for one it cannot read. */
export function fileFont(font: string): FontSpec | null {
	const match = CANVAS_FONT.exec(font);
	if (!match) return null;
	const [, style = '', weight = '', size = '', family = ''] = match;
	const numericWeight = Number(weight);
	return {
		family: family.replace(/^["']|["']$/g, ''),
		size: Number(size),
		weight: Number.isInteger(numericWeight) && numericWeight > 0 ? numericWeight : (NAMED_WEIGHTS[weight.toLowerCase()] ?? FontWeight.Normal),
		style: ITALIC_STYLES.has(style.toLowerCase()) ? FontStyle.Italic : FontStyle.Normal,
	};
}

/** A picture as base64 PNG, without its data URL prefix. */
function pngOf(canvas: HTMLCanvasElement): string {
	const url = canvas.toDataURL(PNG_TYPE);
	return url.startsWith(PNG_DATA_URL_PREFIX) ? url.slice(PNG_DATA_URL_PREFIX.length) : '';
}
