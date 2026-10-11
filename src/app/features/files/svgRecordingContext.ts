/**
 * A stand-in for a canvas 2D context that writes SVG instead of pixels. The
 * editor's own renderer draws vector items into it, so an SVG export has
 * exactly the shapes, curves, arrowheads, gradients and text seen on screen,
 * from the same drawing code, without a second copy of any geometry.
 *
 * It records the part of the canvas API vector drawing uses: paths, fills
 * and strokes, transforms, line styles, gradients, text and images.
 */

import { drawPatternTile, type FillPattern } from '../../core/geometry/fillPattern';
import { patternOfTile } from '../annotations/patternPaint';
import {
	type AffineMatrix,
	IDENTITY_MATRIX,
	isIdentityMatrix,
	multiplyMatrices,
	radiansToDegrees,
	rotation,
	scaling,
	translation,
} from '../../core/geometry/affineMatrix';

const NUMBER_PRECISION = 3;
/** A transform's turn and scale are written finer than coordinates, as their error grows with every distance they carry. */
const MATRIX_PRECISION = 6;
const FULL_TURN = Math.PI * 2;
const HALF_TURN = Math.PI;
const HALF = 2;
const DEFAULT_FONT = '10px sans-serif';
const DEFAULT_COLOR = '#000000';
const DEFAULT_LINE_WIDTH = 1;
const XML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const TextAnchor: Readonly<Record<string, string>> = { center: 'middle', middle: 'middle', right: 'end', end: 'end' };
const DominantBaseline: Readonly<Record<string, string>> = { middle: 'middle', top: 'hanging', hanging: 'hanging', bottom: 'text-after-edge' };

/** What a fill or a line is painted with. */
type RecordedPaint = string | RecordedGradient | RecordedPattern;

interface DrawingState {
	matrix: AffineMatrix;
	fillStyle: RecordedPaint;
	strokeStyle: RecordedPaint;
	lineWidth: number;
	lineCap: CanvasLineCap;
	lineJoin: CanvasLineJoin;
	globalAlpha: number;
	lineDash: number[];
	font: string;
	textAlign: CanvasTextAlign;
	textBaseline: CanvasTextBaseline;
}

type Attributes = Record<string, string | number | undefined>;

/** A path that is only one rectangle or one whole ellipse, which SVG has elements of its own for. */
type SimpleShape =
	| { readonly name: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
	| { readonly name: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
	| { readonly name: 'polyline'; readonly points: readonly (readonly [number, number])[] };

/** How a recorded path was painted. */
const PathPaint = { Fill: 'fill', Stroke: 'stroke' } as const;
type PathPaint = (typeof PathPaint)[keyof typeof PathPaint];

/** One drawing call, kept until it is written: what it drew, under which transform and fading. */
interface RecordedElement {
	readonly name: string;
	readonly attributes: Attributes;
	readonly content?: string;
	readonly matrix: AffineMatrix;
	readonly alpha: number;
	readonly path?: { readonly data: string; readonly shape: SimpleShape | null; readonly paint: PathPaint };
}

/** A gradient as the canvas made it, kept to write as an SVG gradient. */
export class RecordedGradient {
	readonly stops: { offset: number; color: string }[] = [];

	constructor(
		readonly kind: 'linear' | 'radial',
		readonly coordinates: readonly number[],
	) {}

	addColorStop(offset: number, color: string): void {
		this.stops.push({ offset, color });
	}
}

/** A pattern as the canvas made it: the editor's pattern its tile shows, and where its tiles start. */
export class RecordedPattern {
	#origin = { x: 0, y: 0 };

	constructor(
		readonly pattern: FillPattern | undefined,
		readonly tile: CanvasImageSource,
	) {}

	get origin(): Readonly<{ x: number; y: number }> {
		return this.#origin;
	}

	setTransform(transform?: DOMMatrix2DInit): void {
		this.#origin = { x: transform?.e ?? 0, y: transform?.f ?? 0 };
	}
}

/** The attributes a pattern names itself in, so an SVG opened again gets the same pattern back. */
export const PatternAttribute = { Kind: 'data-pattern', Color: 'data-pattern-color', Background: 'data-pattern-background' } as const;

/** Writes numbers short, without trailing zeros. */
export function svgNumber(value: number, precision = NUMBER_PRECISION): string {
	return String(Number(value.toFixed(precision)));
}

export function escapeXml(text: string): string {
	return text.replace(/[&<>"]/g, (character) => XML_ESCAPES[character]!);
}

/** One SVG element, its attributes escaped, empty or holding the given content. */
export function svgElement(name: string, attributes: Readonly<Record<string, string | number | undefined>>, content?: string): string {
	const written = Object.entries(attributes)
		.filter((entry): entry is [string, string | number] => entry[1] !== undefined)
		.map(([key, value]) => ` ${key}="${escapeXml(typeof value === 'number' ? svgNumber(value) : value)}"`)
		.join('');
	return content === undefined ? `<${name}${written}/>` : `<${name}${written}>${content}</${name}>`;
}

export class SvgRecordingContext {
	readonly #records: RecordedElement[] = [];
	readonly #definitions: string[] = [];
	readonly #stack: DrawingState[] = [];
	#path = '';
	/** The current path as one simple shape: unknown while empty, none once it is anything else. */
	#shape: SimpleShape | null | undefined;
	/** Line ends for the next line drawn, as SVG marker references. */
	#markers: Attributes = {};
	#state: DrawingState = {
		matrix: IDENTITY_MATRIX,
		fillStyle: DEFAULT_COLOR,
		strokeStyle: DEFAULT_COLOR,
		lineWidth: DEFAULT_LINE_WIDTH,
		lineCap: 'butt',
		lineJoin: 'miter',
		globalAlpha: 1,
		lineDash: [],
		font: DEFAULT_FONT,
		textAlign: 'start',
		textBaseline: 'alphabetic',
	};
	globalCompositeOperation: GlobalCompositeOperation = 'source-over';
	/** Whether an open path of straight pieces is written as a `polyline`, as a connector is, rather than a `path`. */
	polylines = false;
	imageSmoothingEnabled = true;

	constructor(
		/** The size drawing happens at, as a canvas's would be. */
		readonly canvas: { readonly width: number; readonly height: number },
		/** Prefix for gradient ids, so several recordings in one file do not clash. */
		private readonly idPrefix: string,
	) {}

	/** What was drawn: the gradients it needs, then the elements in drawing order. */
	get definitions(): readonly string[] {
		return this.#definitions;
	}

	/** Every drawing call as its own element, exactly as drawn. */
	get elements(): readonly string[] {
		return this.#records.map((record) => svgElement(record.name, { ...record.attributes, opacity: fading(record.alpha), ...transformAttribute(record.matrix) }, record.content));
	}

	/**
	 * What was drawn as the elements an SVG editor would write: a path filled
	 * and then outlined is one element with both, a lone rectangle or ellipse is
	 * a `rect` or an `ellipse`, and fading is the fill's and the line's own, as
	 * the canvas fades each of them.
	 */
	get shapes(): readonly string[] {
		const shapes: string[] = [];
		for (let index = 0; index < this.#records.length; index++) {
			const record = this.#records[index]!;
			const next = this.#records[index + 1];
			if (next && outlines(record, next)) {
				shapes.push(paintedShape(record, { ...next.attributes, fill: record.attributes.fill, 'fill-rule': record.attributes['fill-rule'] }));
				index++;
			} else shapes.push(record.path ? paintedShape(record, record.attributes) : svgElement(record.name, { ...record.attributes, opacity: fading(record.alpha), ...transformAttribute(record.matrix) }, record.content));
		}
		return shapes;
	}

	/** The paths that were filled, as SVG path data with the transform each was drawn under. */
	get filledPaths(): readonly { readonly data: string; readonly matrix: AffineMatrix }[] {
		return this.#records.flatMap((record) => (record.path?.paint === PathPaint.Fill ? [{ data: record.path.data, matrix: record.matrix }] : []));
	}

	/** Gives the next line drawn these ends, as `marker-start` and `marker-end` references. */
	markLineEnds(markers: Readonly<Attributes>): void {
		this.#markers = { ...markers };
	}

	get fillStyle(): RecordedPaint {
		return this.#state.fillStyle;
	}
	set fillStyle(value: RecordedPaint) {
		this.#state.fillStyle = value;
	}
	get strokeStyle(): RecordedPaint {
		return this.#state.strokeStyle;
	}
	set strokeStyle(value: RecordedPaint) {
		this.#state.strokeStyle = value;
	}
	get lineWidth(): number {
		return this.#state.lineWidth;
	}
	set lineWidth(value: number) {
		this.#state.lineWidth = value;
	}
	get lineCap(): CanvasLineCap {
		return this.#state.lineCap;
	}
	set lineCap(value: CanvasLineCap) {
		this.#state.lineCap = value;
	}
	get lineJoin(): CanvasLineJoin {
		return this.#state.lineJoin;
	}
	set lineJoin(value: CanvasLineJoin) {
		this.#state.lineJoin = value;
	}
	get globalAlpha(): number {
		return this.#state.globalAlpha;
	}
	set globalAlpha(value: number) {
		this.#state.globalAlpha = value;
	}
	get font(): string {
		return this.#state.font;
	}
	set font(value: string) {
		this.#state.font = value;
	}
	get textAlign(): CanvasTextAlign {
		return this.#state.textAlign;
	}
	set textAlign(value: CanvasTextAlign) {
		this.#state.textAlign = value;
	}
	get textBaseline(): CanvasTextBaseline {
		return this.#state.textBaseline;
	}
	set textBaseline(value: CanvasTextBaseline) {
		this.#state.textBaseline = value;
	}

	save(): void {
		this.#stack.push({ ...this.#state, lineDash: [...this.#state.lineDash] });
	}

	restore(): void {
		const previous = this.#stack.pop();
		if (previous) this.#state = previous;
	}

	translate(x: number, y: number): void {
		this.#state.matrix = multiplyMatrices(this.#state.matrix, translation(x, y));
	}

	rotate(angle: number): void {
		this.#state.matrix = multiplyMatrices(this.#state.matrix, rotation(angle));
	}

	scale(x: number, y: number): void {
		this.#state.matrix = multiplyMatrices(this.#state.matrix, scaling(x, y));
	}

	transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
		this.#state.matrix = multiplyMatrices(this.#state.matrix, [a, b, c, d, e, f]);
	}

	setLineDash(segments: number[]): void {
		this.#state.lineDash = [...segments];
	}

	getLineDash(): number[] {
		return [...this.#state.lineDash];
	}

	beginPath(): void {
		this.#path = '';
		this.#shape = undefined;
	}

	moveTo(x: number, y: number): void {
		this.#shape = this.polylines && this.#shape === undefined ? { name: 'polyline', points: [[x, y]] } : null;
		this.#path += `M${svgNumber(x)} ${svgNumber(y)}`;
	}

	lineTo(x: number, y: number): void {
		this.#shape = this.#shape?.name === 'polyline' ? { ...this.#shape, points: [...this.#shape.points, [x, y]] } : null;
		this.#path += `L${svgNumber(x)} ${svgNumber(y)}`;
	}

	bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
		this.#shape = null;
		this.#path += `C${[c1x, c1y, c2x, c2y, x, y].map(svgNumber).join(' ')}`;
	}

	quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
		this.#shape = null;
		this.#path += `Q${[cx, cy, x, y].map(svgNumber).join(' ')}`;
	}

	closePath(): void {
		// A rectangle or a whole ellipse is closed already; a closed polyline is no longer one.
		if (!this.#shape || this.#shape.name === 'polyline') this.#shape = null;
		this.#path += 'Z';
	}

	rect(x: number, y: number, width: number, height: number): void {
		this.#shape =
			this.#shape === undefined
				? { name: 'rect', x: Math.min(x, x + width), y: Math.min(y, y + height), width: Math.abs(width), height: Math.abs(height) }
				: null;
		this.#path += `M${svgNumber(x)} ${svgNumber(y)}h${svgNumber(width)}v${svgNumber(height)}h${svgNumber(-width)}Z`;
	}

	arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise = false): void {
		this.ellipse(x, y, radius, radius, 0, start, end, counterclockwise);
	}

	/** An elliptical arc as SVG arc commands; a whole turn is written as two halves, as SVG cannot draw one. */
	ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, counterclockwise = false): void {
		const sweep = counterclockwise ? -1 : 1;
		let span = (end - start) * sweep;
		if (span >= FULL_TURN || span <= -FULL_TURN) span = FULL_TURN;
		else span = ((span % FULL_TURN) + FULL_TURN) % FULL_TURN;
		const pointAt = (angle: number) => ({
			x: x + rx * Math.cos(angle) * Math.cos(rotation) - ry * Math.sin(angle) * Math.sin(rotation),
			y: y + rx * Math.cos(angle) * Math.sin(rotation) + ry * Math.sin(angle) * Math.cos(rotation),
		});
		const first = pointAt(start);
		this.#shape = this.#shape === undefined && span >= FULL_TURN && rotation === 0 ? { name: 'ellipse', cx: x, cy: y, rx, ry } : null;
		this.#path += `${this.#path ? 'L' : 'M'}${svgNumber(first.x)} ${svgNumber(first.y)}`;
		const pieces = span >= FULL_TURN ? HALF : 1;
		for (let piece = 1; piece <= pieces; piece++) {
			const angle = start + ((span * piece) / pieces) * sweep;
			const point = pointAt(angle);
			const large = span / pieces > HALF_TURN ? 1 : 0;
			const degrees = radiansToDegrees(rotation);
			this.#path += `A${svgNumber(rx)} ${svgNumber(ry)} ${svgNumber(degrees)} ${large} ${counterclockwise ? 0 : 1} ${svgNumber(point.x)} ${svgNumber(point.y)}`;
		}
	}

	fill(rule: CanvasFillRule = 'nonzero'): void {
		if (!this.#path) return;
		this.emitPath(PathPaint.Fill, { 'fill-rule': rule === 'evenodd' ? 'evenodd' : undefined, ...this.paint('fill'), stroke: 'none' });
	}

	stroke(): void {
		if (!this.#path) return;
		this.emitPath(PathPaint.Stroke, { fill: 'none', ...this.paint('stroke'), ...this.lineStyle(), ...this.#markers });
		this.#markers = {};
	}

	fillRect(x: number, y: number, width: number, height: number): void {
		this.emit('rect', { x, y, width, height, ...this.paint('fill') });
	}

	strokeRect(x: number, y: number, width: number, height: number): void {
		this.emit('rect', { x, y, width, height, fill: 'none', ...this.paint('stroke'), ...this.lineStyle() });
	}

	clearRect(): void {}

	fillText(text: string, x: number, y: number, maxWidth?: number): void {
		this.emit(
			'text',
			{
				x,
				y,
				style: `font: ${this.#state.font}; white-space: pre`,
				'text-anchor': TextAnchor[this.#state.textAlign],
				'dominant-baseline': DominantBaseline[this.#state.textBaseline],
				textLength: maxWidth,
				lengthAdjust: maxWidth === undefined ? undefined : 'spacingAndGlyphs',
				...this.paint('fill'),
			},
			escapeXml(text),
		);
	}

	createLinearGradient(x0: number, y0: number, x1: number, y1: number): RecordedGradient {
		return new RecordedGradient('linear', [x0, y0, x1, y1]);
	}

	createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): RecordedGradient {
		return new RecordedGradient('radial', [x0, y0, r0, x1, y1, r1]);
	}

	createPattern(tile: CanvasImageSource): RecordedPattern {
		return new RecordedPattern(patternOfTile(tile), tile);
	}

	/** An image drawn into the picture, embedded as a PNG at the place and size it is drawn. */
	drawImage(source: CanvasImageSource, x: number, y: number, width?: number, height?: number): void {
		const canvas = asCanvas(source);
		this.emit('image', {
			href: canvas.toDataURL('image/png'),
			x,
			y,
			width: width ?? canvas.width,
			height: height ?? canvas.height,
			preserveAspectRatio: 'none',
		});
	}

	private emit(name: string, attributes: Attributes, content?: string): void {
		this.#records.push({ name, attributes, content, matrix: this.#state.matrix, alpha: this.#state.globalAlpha });
	}

	private emitPath(paint: PathPaint, attributes: Attributes): void {
		this.#records.push({
			name: 'path',
			attributes: { d: this.#path, ...attributes },
			matrix: this.#state.matrix,
			alpha: this.#state.globalAlpha,
			path: { data: this.#path, shape: this.#shape ?? null, paint },
		});
	}

	private paint(kind: 'fill' | 'stroke'): Record<string, string> {
		const style = kind === 'fill' ? this.#state.fillStyle : this.#state.strokeStyle;
		if (typeof style === 'string') return { [kind]: style };
		return { [kind]: `url(#${style instanceof RecordedPattern ? this.definePattern(style) : this.defineGradient(style)})` };
	}

	/**
	 * A pattern as an SVG definition: the editor's own pattern drawn as vectors
	 * in its tile and named, or, for a tile of anything else, its picture.
	 */
	private definePattern(recorded: RecordedPattern): string {
		const id = `${this.idPrefix}pattern-${this.#definitions.length + 1}`;
		const { pattern, origin } = recorded;
		const tile = asCanvas(recorded.tile);
		const size = { width: pattern?.size ?? tile.width, height: pattern?.size ?? tile.height };
		const content = pattern ? patternTileMarkup(pattern, id) : svgElement('image', { href: tile.toDataURL('image/png'), ...size });
		const named = pattern
			? { [PatternAttribute.Kind]: pattern.kind, [PatternAttribute.Color]: pattern.color, [PatternAttribute.Background]: pattern.background }
			: {};
		this.#definitions.push(
			svgElement('pattern', { id, patternUnits: 'userSpaceOnUse', ...size, patternTransform: origin.x || origin.y ? `translate(${svgNumber(origin.x)} ${svgNumber(origin.y)})` : undefined, ...named }, content),
		);
		return id;
	}

	private lineStyle(): Record<string, string | number | undefined> {
		return {
			'stroke-width': this.#state.lineWidth,
			'stroke-linecap': this.#state.lineCap === 'butt' ? undefined : this.#state.lineCap,
			'stroke-linejoin': this.#state.lineJoin === 'miter' ? undefined : this.#state.lineJoin,
			'stroke-dasharray': this.#state.lineDash.length ? this.#state.lineDash.map(svgNumber).join(' ') : undefined,
		};
	}

	/** The gradient as an SVG definition in the drawing's own coordinates, and its id. */
	private defineGradient(gradient: RecordedGradient): string {
		const id = `${this.idPrefix}gradient-${this.#definitions.length + 1}`;
		const stops = gradient.stops.map(({ offset, color }) => svgElement('stop', { offset, 'stop-color': color })).join('');
		const position = gradient.kind === 'linear' ? linearPosition(gradient.coordinates) : radialPosition(gradient.coordinates);
		this.#definitions.push(svgElement(gradient.kind === 'linear' ? 'linearGradient' : 'radialGradient', { id, gradientUnits: 'userSpaceOnUse', ...position }, stops));
		return id;
	}
}

/** A pattern's tile as SVG, drawn by the same code that draws it on the canvas. */
function patternTileMarkup(pattern: FillPattern, id: string): string {
	const recorder = new SvgRecordingContext({ width: pattern.size, height: pattern.size }, `${id}-`);
	drawPatternTile(recorder, pattern);
	return recorder.shapes.join('');
}

/** Whether `next` outlines the very path `record` filled, under the same transform and fading. */
function outlines(record: RecordedElement, next: RecordedElement): boolean {
	return (
		record.path?.paint === PathPaint.Fill &&
		next.path?.paint === PathPaint.Stroke &&
		next.path.data === record.path.data &&
		next.alpha === record.alpha &&
		next.matrix.every((value, index) => value === record.matrix[index])
	);
}

/** A painted path as its simplest element, faded by its fill's and its line's own opacity. */
function paintedShape(record: RecordedElement, attributes: Attributes): string {
	const shape = record.path?.shape;
	const { d, ...paint } = attributes;
	const faded = record.alpha === 1 ? {} : {
		'fill-opacity': paint.fill === 'none' ? undefined : record.alpha,
		'stroke-opacity': paint.stroke === 'none' ? undefined : record.alpha,
	};
	const geometry = shape ? shapeGeometry(shape) : { d };
	return svgElement(shape?.name ?? 'path', { ...geometry, ...paint, ...faded, ...transformAttribute(record.matrix) });
}

/** A simple shape's own attributes. */
function shapeGeometry(shape: SimpleShape): Attributes {
	if (shape.name === 'rect') return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
	if (shape.name === 'ellipse') return { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry };
	return { points: shape.points.map((point) => point.map((value) => svgNumber(value)).join(',')).join(' ') };
}

function fading(alpha: number): number | undefined {
	return alpha === 1 ? undefined : alpha;
}

function transformAttribute(matrix: AffineMatrix): Attributes {
	return isIdentityMatrix(matrix) ? {} : { transform: `matrix(${matrix.map((value) => svgNumber(value, MATRIX_PRECISION)).join(' ')})` };
}

/** A canvas linear gradient's line, from (x0, y0) to (x1, y1), as SVG writes it. */
function linearPosition([x0, y0, x1, y1]: readonly number[]): Record<string, number | undefined> {
	return { x1: x0, y1: y0, x2: x1, y2: y1 };
}

/** A canvas radial gradient's two circles, the inner as SVG's focus and the outer as its circle. */
function radialPosition([x0, y0, r0, x1, y1, r1]: readonly number[]): Record<string, number | undefined> {
	return { cx: x1, cy: y1, r: r1, fx: x0, fy: y0, fr: r0 };
}

/** An image source as a canvas, which can be written as a PNG. */
function asCanvas(source: CanvasImageSource): HTMLCanvasElement {
	if (source instanceof HTMLCanvasElement) return source;
	const canvas = document.createElement('canvas');
	const size = source as { width: number; height: number };
	canvas.width = size.width;
	canvas.height = size.height;
	canvas.getContext('2d')?.drawImage(source, 0, 0);
	return canvas;
}

/**
 * The recorder as the canvas context the renderer draws into. Only vector
 * items are drawn into it, and they use no more of the canvas API than it has.
 */
export function asCanvasContext(recorder: SvgRecordingContext): CanvasRenderingContext2D {
	return recorder as unknown as CanvasRenderingContext2D;
}
