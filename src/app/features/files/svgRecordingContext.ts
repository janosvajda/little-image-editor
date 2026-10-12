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
const TRANSPARENT = 'transparent';
const NO_FILTER = 'none';
/** The one canvas filter SVG has an equal of: a Gaussian blur, its spread in pixels. */
const CANVAS_BLUR = /^blur\(\s*([\d.]+)px\s*\)$/;
/** A canvas shadow's blur is twice the spread SVG's Gaussian blur names. */
const SHADOW_BLUR_PER_DEVIATION = 2;
/** The nine-number form of drawImage, which draws a part of an image, and where its destination starts. */
const CROPPED_DRAW = 8;
const CROPPED_DESTINATION = 4;
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
	shadowColor: string;
	shadowBlur: number;
	/** The clip drawing is kept inside, as an SVG clipPath's id; none when it is not clipped. */
	clip?: string;
	/** A canvas filter, of which the blur SVG has a filter for is kept. */
	filter: string;
	compositing: GlobalCompositeOperation;
}

/**
 * A mask that what was drawn before it is kept through: erasing hides what
 * its marks cover, as `destination-out` does, and keeping shows only what its
 * marks cover, as `destination-in` does.
 */
interface RecordedMask {
	readonly id: string;
	readonly keeps: boolean;
	readonly marks: RecordedElement[];
}

/** How compositing marks a mask: erasing hides what it covers, keeping shows only that. */
const MaskCompositing: Readonly<Partial<Record<GlobalCompositeOperation, { readonly keeps: boolean }>>> = {
	'destination-out': { keeps: false },
	'destination-in': { keeps: true },
};
/** What a mask shows in full, and hides in full; marks fade between them. */
const MaskPaint = { Shown: '#ffffff', Hidden: '#000000' } as const;
/** How far beyond the canvas, in canvas sizes, a mask reaches, so it covers whatever turned drawing it is used under. */
const MASK_MARGIN = 1;
const MASK_SPAN = MASK_MARGIN * 2 + 1;

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
		shadowColor: TRANSPARENT,
		shadowBlur: 0,
		filter: NO_FILTER,
		compositing: 'source-over',
	};
	readonly #masks: RecordedMask[] = [];
	/** The mask erasing goes on adding to, until something is drawn over it. */
	#openMask: RecordedMask | null = null;
	/** Each item is recorded on its own, so erasing takes away only from it. */
	readonly isolatesItems = true;
	/** The soft-edge filters made so far, by how soft they are, so each is defined once. */
	readonly #softEdges = new Map<number, string>();
	/** Whether an open path of straight pieces is written as a `polyline`, as a connector is, rather than a `path`. */
	polylines = false;
	imageSmoothingEnabled = true;

	constructor(
		/** The size drawing happens at, as a canvas's would be. */
		readonly canvas: { readonly width: number; readonly height: number },
		/** Prefix for gradient ids, so several recordings in one file do not clash. */
		private readonly idPrefix: string,
		/** Images the file already holds, by the id of their element: drawing one again refers to it rather than holding it twice. */
		private readonly images: ReadonlyMap<CanvasImageSource, string> = new Map(),
	) {}

	/** What was drawn: the gradients and masks it needs, then the elements in drawing order. */
	get definitions(): readonly string[] {
		return [...this.#definitions, ...this.#masks.map((mask) => this.maskMarkup(mask))];
	}

	get globalCompositeOperation(): GlobalCompositeOperation {
		return this.#state.compositing;
	}
	set globalCompositeOperation(value: GlobalCompositeOperation) {
		this.#state.compositing = value;
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
		return shapesOf(this.#records);
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
	get shadowColor(): string {
		return this.#state.shadowColor;
	}
	set shadowColor(value: string) {
		this.#state.shadowColor = value;
	}
	get shadowBlur(): number {
		return this.#state.shadowBlur;
	}
	set shadowBlur(value: number) {
		this.#state.shadowBlur = value;
	}
	get filter(): string {
		return this.#state.filter;
	}
	set filter(value: string) {
		this.#state.filter = value;
	}

	/** Keeps what is drawn next inside the current path, as an SVG clipPath, until the state is restored. */
	clip(rule: CanvasFillRule = 'nonzero'): void {
		const id = `${this.idPrefix}clip-${this.#definitions.length + 1}`;
		const outline = svgElement('path', { d: this.#path, 'clip-rule': rule === 'evenodd' ? 'evenodd' : undefined, ...transformAttribute(this.#state.matrix) });
		this.#definitions.push(svgElement('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, outline));
		this.#state.clip = id;
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
		this.#path += rectData(x, y, width, height);
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

	/** A filled rectangle; several in a row in the same paint join one path, as a spray's dots or a fill's rows do. */
	fillRect(x: number, y: number, width: number, height: number): void {
		const record: RecordedElement = { name: 'rect', attributes: { x, y, width, height, ...this.paint('fill'), ...this.clipAndFilter() }, matrix: this.#state.matrix, alpha: this.#state.globalAlpha };
		const previous = this.#records.at(-1);
		if (!previous || MaskCompositing[this.#state.compositing] || !fillsAlike(previous, record)) {
			this.record(record);
			return;
		}
		const data = `${filledData(previous)}${rectData(x, y, width, height)}`;
		const { x: _x, y: _y, width: _width, height: _height, ...paint } = record.attributes;
		this.#records[this.#records.length - 1] = { ...record, name: 'path', attributes: { d: data, ...paint, stroke: 'none' }, path: { data, shape: null, paint: PathPaint.Fill } };
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

	/**
	 * An image drawn into the picture: one the file already holds is referred
	 * to where it lies, as a blur over the photo does, and any other is
	 * embedded as a PNG at the place and size it is drawn. A part of an image
	 * drawn at its own place, as the nine-number form can draw it, is the image
	 * kept to that part.
	 */
	drawImage(source: CanvasImageSource, ...placement: number[]): void {
		const shared = this.images.get(source);
		if (shared) {
			this.emit('use', { href: `#${shared}` });
			return;
		}
		const canvas = asCanvas(source);
		const [x = 0, y = 0, width = canvas.width, height = canvas.height] = placement.length === CROPPED_DRAW ? placement.slice(CROPPED_DESTINATION) : placement;
		this.emit('image', { href: canvas.toDataURL('image/png'), x, y, width, height, preserveAspectRatio: 'none' });
	}

	private emit(name: string, attributes: Attributes, content?: string): void {
		this.record({ name, attributes: { ...attributes, ...this.clipAndFilter() }, content, matrix: this.#state.matrix, alpha: this.#state.globalAlpha });
	}

	/**
	 * Something drawn: shown, or, while compositing erases or keeps, a mark in
	 * the mask everything drawn before it is kept through.
	 */
	private record(record: RecordedElement): void {
		const compositing = MaskCompositing[this.#state.compositing];
		if (!compositing) {
			this.#openMask = null;
			this.#records.push(record);
			return;
		}
		if (this.#openMask?.keeps === compositing.keeps) {
			this.#openMask.marks.push(record);
			return;
		}
		const mask: RecordedMask = { id: `${this.idPrefix}mask-${this.#masks.length + 1}`, keeps: compositing.keeps, marks: [record] };
		const kept = shapesOf(this.#records.splice(0)).join('');
		this.#records.push({ name: 'g', attributes: { mask: `url(#${mask.id})` }, content: kept, matrix: IDENTITY_MATRIX, alpha: 1 });
		this.#masks.push(mask);
		this.#openMask = mask;
	}

	/** A mask as SVG: shown or hidden everywhere, and its marks the other way. */
	private maskMarkup({ id, keeps, marks }: RecordedMask): string {
		const { width, height } = this.canvas;
		const area = { x: -width * MASK_MARGIN, y: -height * MASK_MARGIN, width: width * MASK_SPAN, height: height * MASK_SPAN };
		const ground = svgElement('rect', { ...area, fill: keeps ? MaskPaint.Hidden : MaskPaint.Shown });
		return svgElement('mask', { id, maskUnits: 'userSpaceOnUse', ...area }, `${ground}${shapesOf(marks).join('')}`);
	}

	/** The clip and the blur the state draws through, as SVG references. */
	private clipAndFilter(): Attributes {
		const blur = CANVAS_BLUR.exec(this.#state.filter.trim())?.[1];
		return { 'clip-path': this.#state.clip ? `url(#${this.#state.clip})` : undefined, filter: blur === undefined ? undefined : `url(#${this.blurFilter(Number(blur))})` };
	}

	/** An SVG Gaussian blur of the given spread, defined once for each spread. */
	private blurFilter(spread: number): string {
		const id = `${this.idPrefix}blur-${svgNumber(spread).replace('.', '_')}`;
		if (!this.#definitions.some((definition) => definition.includes(`id="${id}"`)))
			this.#definitions.push(svgElement('filter', { id }, svgElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: spread })));
		return id;
	}

	/**
	 * A painted path; a path painted just as the one before joins it, so a
	 * brush's many pieces are one element. A soft edge, as a canvas shadow
	 * gives a brush, is an SVG blur under the path.
	 */
	private emitPath(paint: PathPaint, attributes: Attributes): void {
		const softEdge = this.softEdge();
		const record: RecordedElement = {
			name: 'path',
			attributes: { d: this.#path, ...attributes, ...this.clipAndFilter(), ...(softEdge ? { filter: softEdge } : {}) },
			matrix: this.#state.matrix,
			alpha: this.#state.globalAlpha,
			path: { data: this.#path, shape: this.#shape ?? null, paint },
		};
		// A mark joins only marks of the mask it goes in, never the drawing it hides or keeps, however alike their paint.
		const masking = MaskCompositing[this.#state.compositing];
		const records = masking ? (this.#openMask?.keeps === masking.keeps ? this.#openMask.marks : []) : this.#records;
		const previous = records.at(-1);
		if (previous?.path && joins(previous, record)) {
			const data = `${previous.path.data}${record.path!.data}`;
			records[records.length - 1] = { ...previous, attributes: { ...previous.attributes, d: data }, path: { data, shape: null, paint } };
		} else this.record(record);
	}

	/** The filter a canvas shadow of the drawing's own colour gives it: its soft edge. */
	private softEdge(): string | undefined {
		const { shadowBlur, shadowColor } = this.#state;
		if (shadowBlur <= 0 || shadowColor === TRANSPARENT) return undefined;
		const known = this.#softEdges.get(shadowBlur);
		if (known) return `url(#${known})`;
		const id = `${this.idPrefix}soft-${this.#softEdges.size + 1}`;
		this.#softEdges.set(shadowBlur, id);
		const blurred = svgElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: shadowBlur / SHADOW_BLUR_PER_DEVIATION, result: 'soft' });
		const merged = svgElement('feMerge', {}, `${svgElement('feMergeNode', { in: 'soft' })}${svgElement('feMergeNode', { in: 'SourceGraphic' })}`);
		this.#definitions.push(svgElement('filter', { id }, `${blurred}${merged}`));
		return `url(#${id})`;
	}

	private paint(kind: 'fill' | 'stroke'): Record<string, string> {
		// A mark in a mask hides or shows by how light it is, not by its colour.
		const compositing = MaskCompositing[this.#state.compositing];
		if (compositing) return { [kind]: compositing.keeps ? MaskPaint.Shown : MaskPaint.Hidden };
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

/** What a drawing is painted and kept in: rectangles that agree on all of it can be one path. */
const DRAWN_THROUGH = ['fill', 'clip-path', 'filter'] as const;

function rectData(x: number, y: number, width: number, height: number): string {
	return `M${svgNumber(x)} ${svgNumber(y)}h${svgNumber(width)}v${svgNumber(height)}h${svgNumber(-width)}Z`;
}

/** What a filled rectangle or a filled path covers, as path data. */
function filledData(record: RecordedElement): string {
	if (record.path) return record.path.data;
	const { x, y, width, height } = record.attributes as Record<'x' | 'y' | 'width' | 'height', number>;
	return rectData(x, y, width, height);
}

/** Whether a rectangle is filled just as `previous` was filled, a rectangle or a path of them, so the two can be one path. */
function fillsAlike(previous: RecordedElement, rectangle: RecordedElement): boolean {
	const filledRect = previous.name === 'rect' && previous.attributes.stroke === undefined;
	const filledPath = previous.path?.paint === PathPaint.Fill && previous.attributes['fill-rule'] === undefined;
	return (
		(filledRect || filledPath) &&
		DRAWN_THROUGH.every((name) => previous.attributes[name] === rectangle.attributes[name]) &&
		previous.alpha === rectangle.alpha &&
		previous.matrix.every((value, index) => value === rectangle.matrix[index])
	);
}

/**
 * What was drawn as the elements an SVG editor would write: a path filled
 * and then outlined is one element with both, a lone rectangle or ellipse is
 * a `rect` or an `ellipse`.
 */
function shapesOf(records: readonly RecordedElement[]): string[] {
	const shapes: string[] = [];
	for (let index = 0; index < records.length; index++) {
		const record = records[index]!;
		const next = records[index + 1];
		if (next && outlines(record, next)) {
			shapes.push(paintedShape(record, { ...next.attributes, fill: record.attributes.fill, 'fill-rule': record.attributes['fill-rule'] }));
			index++;
		} else shapes.push(record.path ? paintedShape(record, record.attributes) : svgElement(record.name, { ...record.attributes, opacity: fading(record.alpha), ...transformAttribute(record.matrix) }, record.content));
	}
	return shapes;
}

/** Whether `next` paints just as `previous` did, with no ends of its own, so the two can be one path. */
function joins(previous: RecordedElement, next: RecordedElement): boolean {
	if (previous.path?.paint !== next.path?.paint || previous.alpha !== next.alpha || previous.matrix.some((value, index) => value !== next.matrix[index])) return false;
	const { d: _previous, ...previousPaint } = previous.attributes;
	const { d: _next, ...nextPaint } = next.attributes;
	const keys = new Set([...Object.keys(previousPaint), ...Object.keys(nextPaint)]);
	return [...keys].every((key) => !key.startsWith('marker') && previousPaint[key] === nextPaint[key]);
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
