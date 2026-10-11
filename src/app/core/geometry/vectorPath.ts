import type { CropRect, Point } from '../document/appTypes';

/**
 * Vector paths, as SVG draws them: contours of nodes joined by straight
 * lines or cubic Bézier curves. A node holds its point and, for curves, the
 * handles on either side of it, in absolute coordinates, so moving a node,
 * a handle or the whole path is plain arithmetic. Shared by drawing, hit
 * testing, editing, and SVG path data in and out.
 */

export interface PathNode {
	readonly point: Point;
	/** The handle of the curve arriving at this node, if it curves. */
	readonly in?: Point;
	/** The handle of the curve leaving this node, if it curves. */
	readonly out?: Point;
}

export interface PathContour {
	readonly nodes: readonly PathNode[];
	readonly closed: boolean;
}

export const FillRule = { NonZero: 'nonzero', EvenOdd: 'evenodd' } as const;
export type FillRule = (typeof FillRule)[keyof typeof FillRule];

export class PathDataError extends Error {}

/** One piece of a contour: a line, or a cubic curve with its two handles. */
interface PathPiece {
	readonly from: Point;
	readonly to: Point;
	readonly c1?: Point;
	readonly c2?: Point;
}

/** Straight pieces per curve when a path is flattened for hit testing. */
const CURVE_STEPS = 24;
const HALF = 2;
const THIRD = 3;
/** An arc is drawn as cubic curves of at most a quarter turn each. */
const ARC_SEGMENT_LIMIT = Math.PI / HALF;
const FULL_TURN = Math.PI * HALF;
const QUARTER_DIVISOR = 4;
/** The handle length of a cubic curve along an arc, per tangent of a quarter of its angle. */
const ARC_HANDLE_FACTOR = QUARTER_DIVISOR / THIRD;
const DEGREES_PER_HALF_TURN = 180;
const PATH_TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
/** Numbers each command takes, per repetition. */
const COMMAND_ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER_PRECISION = 3;

/** Every piece of a contour, closing it back to its first node when it is closed. */
export function pathPieces({ nodes, closed }: PathContour): PathPiece[] {
	const pieces: PathPiece[] = [];
	const count = closed ? nodes.length : nodes.length - 1;
	for (let index = 0; index < count; index++) {
		const start = nodes[index]!;
		const end = nodes[(index + 1) % nodes.length]!;
		pieces.push(start.out || end.in
			? { from: start.point, to: end.point, c1: start.out ?? start.point, c2: end.in ?? end.point }
			: { from: start.point, to: end.point });
	}
	return pieces;
}

/** What tracing needs from a canvas path or context; kept to these calls so the module needs no DOM. */
export interface PathTracer {
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
	closePath(): void;
}

/** Traces the contours into a canvas path, ready to fill or stroke. */
export function tracePath(path: PathTracer, contours: readonly PathContour[]): void {
	for (const contour of contours) {
		const first = contour.nodes[0];
		if (!first) continue;
		path.moveTo(first.point.x, first.point.y);
		for (const piece of pathPieces(contour)) {
			if (piece.c1 && piece.c2) path.bezierCurveTo(piece.c1.x, piece.c1.y, piece.c2.x, piece.c2.y, piece.to.x, piece.to.y);
			else path.lineTo(piece.to.x, piece.to.y);
		}
		if (contour.closed) path.closePath();
	}
}

/** The exact box around the drawn path, curves included at their furthest points. */
export function pathBounds(contours: readonly PathContour[]): CropRect {
	const points = contours.flatMap((contour) => [
		...contour.nodes.slice(0, 1).map(({ point }) => point),
		...pathPieces(contour).flatMap((piece) => [piece.to, ...curveExtremes(piece)]),
	]);
	if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
	const xs = points.map(({ x }) => x);
	const ys = points.map(({ y }) => y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The points of a curve where it turns back in x or in y. */
function curveExtremes({ from, c1, c2, to }: PathPiece): Point[] {
	if (!c1 || !c2) return [];
	const roots = (a: number, b: number, c: number, d: number): number[] => {
		// The derivative of a cubic Bézier, as a quadratic in t.
		const qa = -a + THIRD * b - THIRD * c + d;
		const qb = HALF * (a - HALF * b + c);
		const qc = b - a;
		if (Math.abs(qa) < Number.EPSILON) return Math.abs(qb) < Number.EPSILON ? [] : [-qc / qb];
		const discriminant = qb * qb - QUARTER_DIVISOR * qa * qc;
		if (discriminant < 0) return [];
		const root = Math.sqrt(discriminant);
		return [(-qb + root) / (HALF * qa), (-qb - root) / (HALF * qa)];
	};
	return [...roots(from.x, c1.x, c2.x, to.x), ...roots(from.y, c1.y, c2.y, to.y)]
		.filter((t) => t > 0 && t < 1)
		.map((t) => cubicPoint(from, c1, c2, to, t));
}

export function cubicPoint(from: Point, c1: Point, c2: Point, to: Point, t: number): Point {
	const u = 1 - t;
	const a = u * u * u;
	const b = THIRD * u * u * t;
	const c = THIRD * u * t * t;
	const d = t * t * t;
	return { x: a * from.x + b * c1.x + c * c2.x + d * to.x, y: a * from.y + b * c1.y + c * c2.y + d * to.y };
}

/** Each contour as straight pieces close to its curves, for hit testing. */
export function flattenContour(contour: PathContour): Point[] {
	const first = contour.nodes[0];
	if (!first) return [];
	const points = [first.point];
	for (const piece of pathPieces(contour)) {
		if (!piece.c1 || !piece.c2) points.push(piece.to);
		else for (let step = 1; step <= CURVE_STEPS; step++) points.push(cubicPoint(piece.from, piece.c1, piece.c2, piece.to, step / CURVE_STEPS));
	}
	return points;
}

/** Every point of every node, handles included, moved by the same rule. */
export function mapPathPoints(contours: readonly PathContour[], map: (point: Point) => Point): PathContour[] {
	return contours.map(({ nodes, closed }) => ({
		closed,
		nodes: nodes.map((node) => ({
			point: map(node.point),
			...(node.in ? { in: map(node.in) } : {}),
			...(node.out ? { out: map(node.out) } : {}),
		})),
	}));
}

/** Whether a point is inside the filled area of closed contours, by the fill rule. */
export function pathContains(contours: readonly PathContour[], point: Point, rule: FillRule = FillRule.NonZero): boolean {
	let winding = 0;
	let crossings = 0;
	for (const contour of contours) {
		const polygon = flattenContour({ ...contour, closed: true });
		polygon.forEach((start, index) => {
			const end = polygon[(index + 1) % polygon.length]!;
			if ((start.y <= point.y) === (end.y <= point.y)) return;
			const x = start.x + ((point.y - start.y) * (end.x - start.x)) / (end.y - start.y);
			if (x <= point.x) return;
			crossings++;
			winding += end.y > start.y ? 1 : -1;
		});
	}
	return rule === FillRule.EvenOdd ? crossings % HALF === 1 : winding !== 0;
}

/** SVG path data for the contours, with absolute commands. */
export function pathData(contours: readonly PathContour[]): string {
	return contours
		.map((contour) => {
			const first = contour.nodes[0];
			if (!first) return '';
			const all = pathPieces(contour);
			// Z draws a straight way back to the start itself; only a curved one is written out.
			const closing = contour.closed ? all.at(-1) : undefined;
			const written = closing && !closing.c1 ? all.slice(0, -1) : all;
			const pieces = written.map((piece) =>
				piece.c1 && piece.c2 ? `C${numbers(piece.c1, piece.c2, piece.to)}` : `L${numbers(piece.to)}`,
			);
			return `M${numbers(first.point)}${pieces.join('')}${contour.closed ? 'Z' : ''}`;
		})
		.join('');
}

function numbers(...points: readonly Point[]): string {
	return points.map(({ x, y }) => `${round(x)} ${round(y)}`).join(' ');
}

function round(value: number): number {
	return Number(value.toFixed(NUMBER_PRECISION));
}

/**
 * Reads SVG path data into contours: every command, relative or absolute,
 * with quadratic curves and arcs turned into the cubic curves they equal.
 */
export function parsePathData(data: string): PathContour[] {
	return new PathDataReader(data).read();
}

class PathDataReader {
	readonly #tokens: string[];
	#index = 0;
	readonly #contours: { nodes: PathNode[]; closed: boolean }[] = [];
	#current: Point = { x: 0, y: 0 };
	#start: Point = { x: 0, y: 0 };
	/** The last curve's second handle, which S and T reflect. */
	#lastHandle: Point | null = null;
	#lastCommand = '';

	constructor(data: string) {
		this.#tokens = data.match(PATH_TOKEN) ?? [];
		const leftover = data.replace(PATH_TOKEN, '').replace(/[\s,]/g, '');
		if (leftover) throw new PathDataError(`Unexpected "${leftover[0]}" in the path data.`);
	}

	read(): PathContour[] {
		let command = '';
		while (this.#index < this.#tokens.length) {
			const token = this.#tokens[this.#index]!;
			if (/[a-z]/i.test(token)) {
				command = token;
				this.#index++;
			} else if (!command) throw new PathDataError('Path data starts with a command such as M.');
			this.command(command);
			// After a move, further pairs are lines.
			if (command === 'M') command = 'L';
			else if (command === 'm') command = 'l';
			if (command.toUpperCase() === 'Z') command = '';
		}
		// A lone move draws nothing.
		const contours = this.#contours.filter(({ nodes }) => nodes.length > 1);
		if (!contours.length) throw new PathDataError('The path data draws nothing.');
		return contours;
	}

	private command(command: string): void {
		const upper = command.toUpperCase();
		const relative = command !== upper;
		const values = this.take(COMMAND_ARITY[upper]!, command);
		const base = relative ? this.#current : { x: 0, y: 0 };
		const at = (x: number, y: number): Point => ({ x: base.x + x, y: base.y + y });
		switch (upper) {
			case 'M':
				return this.moveTo(at(values[0]!, values[1]!));
			case 'L':
				return this.lineTo(at(values[0]!, values[1]!));
			case 'H':
				return this.lineTo({ x: (relative ? this.#current.x : 0) + values[0]!, y: this.#current.y });
			case 'V':
				return this.lineTo({ x: this.#current.x, y: (relative ? this.#current.y : 0) + values[0]! });
			case 'C':
				return this.curveTo(at(values[0]!, values[1]!), at(values[2]!, values[3]!), at(values[4]!, values[5]!), upper);
			case 'S':
				return this.curveTo(this.reflected('CS'), at(values[0]!, values[1]!), at(values[2]!, values[3]!), upper);
			case 'Q':
				return this.quadraticTo(at(values[0]!, values[1]!), at(values[2]!, values[3]!), upper);
			case 'T':
				return this.quadraticTo(this.reflected('QT'), at(values[0]!, values[1]!), upper);
			case 'A':
				return this.arcTo(values, at(values[5]!, values[6]!));
			default:
				return this.close();
		}
	}

	private take(count: number, command: string): number[] {
		const values = this.#tokens.slice(this.#index, this.#index + count).map(Number);
		if (values.length < count || values.some((value) => !Number.isFinite(value)))
			throw new PathDataError(`${command} needs ${count} numbers.`);
		this.#index += count;
		return values;
	}

	private contour(): { nodes: PathNode[]; closed: boolean } {
		if (!this.#contours.length) this.moveTo(this.#current);
		return this.#contours.at(-1)!;
	}

	private moveTo(point: Point): void {
		this.#contours.push({ nodes: [{ point }], closed: false });
		this.#current = point;
		this.#start = point;
		this.#lastHandle = null;
		this.#lastCommand = 'M';
	}

	private lineTo(point: Point): void {
		this.contour().nodes.push({ point });
		this.#current = point;
		this.#lastHandle = null;
		this.#lastCommand = 'L';
	}

	private curveTo(c1: Point, c2: Point, point: Point, command: string): void {
		const nodes = this.contour().nodes;
		const last = nodes.at(-1)!;
		nodes[nodes.length - 1] = { ...last, out: c1 };
		nodes.push({ point, in: c2 });
		this.#current = point;
		this.#lastHandle = c2;
		this.#lastCommand = command;
	}

	/** A quadratic curve as the cubic curve it equals. */
	private quadraticTo(control: Point, point: Point, command: string): void {
		const from = this.#current;
		const toward = (end: Point): Point => ({ x: end.x + (HALF / THIRD) * (control.x - end.x), y: end.y + (HALF / THIRD) * (control.y - end.y) });
		this.curveTo(toward(from), toward(point), point, command);
		this.#lastHandle = control;
	}

	/** The previous handle mirrored through the current point, when the previous command was one of `commands`. */
	private reflected(commands: string): Point {
		if (!this.#lastHandle || !commands.includes(this.#lastCommand)) return this.#current;
		return { x: HALF * this.#current.x - this.#lastHandle.x, y: HALF * this.#current.y - this.#lastHandle.y };
	}

	/** An elliptical arc as cubic curves of at most a quarter turn each. */
	private arcTo(values: readonly number[], end: Point): void {
		const [rxIn, ryIn, rotationDegrees, largeArc, sweep] = values as [number, number, number, number, number];
		const from = this.#current;
		if (!rxIn || !ryIn || (from.x === end.x && from.y === end.y)) {
			this.lineTo(end);
			return;
		}
		const phi = (rotationDegrees * Math.PI) / DEGREES_PER_HALF_TURN;
		const cos = Math.cos(phi);
		const sin = Math.sin(phi);
		const dx = (from.x - end.x) / HALF;
		const dy = (from.y - end.y) / HALF;
		const x1 = cos * dx + sin * dy;
		const y1 = -sin * dx + cos * dy;
		let rx = Math.abs(rxIn);
		let ry = Math.abs(ryIn);
		const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
		if (scale > 1) {
			rx *= Math.sqrt(scale);
			ry *= Math.sqrt(scale);
		}
		const sign = Boolean(largeArc) === Boolean(sweep) ? -1 : 1;
		const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
		const factor = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
		const cx1 = (factor * rx * y1) / ry;
		const cy1 = (-factor * ry * x1) / rx;
		const centre = { x: cos * cx1 - sin * cy1 + (from.x + end.x) / HALF, y: sin * cx1 + cos * cy1 + (from.y + end.y) / HALF };
		const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
		const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
		let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
		if (!sweep && delta > 0) delta -= FULL_TURN;
		if (sweep && delta < 0) delta += FULL_TURN;
		const segments = Math.ceil(Math.abs(delta) / ARC_SEGMENT_LIMIT);
		const step = delta / segments;
		const handle = ARC_HANDLE_FACTOR * Math.tan(step / QUARTER_DIVISOR);
		const onEllipse = (theta: number): Point => ({
			x: centre.x + rx * Math.cos(theta) * cos - ry * Math.sin(theta) * sin,
			y: centre.y + rx * Math.cos(theta) * sin + ry * Math.sin(theta) * cos,
		});
		const tangent = (theta: number): Point => ({
			x: -rx * Math.sin(theta) * cos - ry * Math.cos(theta) * sin,
			y: -rx * Math.sin(theta) * sin + ry * Math.cos(theta) * cos,
		});
		for (let index = 0; index < segments; index++) {
			const a = start + index * step;
			const b = a + step;
			const p0 = onEllipse(a);
			const p3 = index === segments - 1 ? end : onEllipse(b);
			const t0 = tangent(a);
			const t1 = tangent(b);
			this.curveTo({ x: p0.x + handle * t0.x, y: p0.y + handle * t0.y }, { x: p3.x - handle * t1.x, y: p3.y - handle * t1.y }, p3, 'A');
		}
		this.#lastHandle = null;
	}

	private close(): void {
		const contour = this.contour();
		const nodes = contour.nodes;
		const first = nodes[0]!;
		const last = nodes.at(-1)!;
		// A path that returns to its start before Z ends where it began: the first node takes the last one's handle.
		if (nodes.length > 1 && last.point.x === first.point.x && last.point.y === first.point.y) {
			nodes.pop();
			nodes[0] = { ...first, ...(last.in ? { in: last.in } : {}) };
		}
		contour.closed = true;
		this.#current = this.#start;
		this.#lastHandle = null;
		this.#lastCommand = 'Z';
	}
}

/** Whether a value read from a file is a contour: nodes with points, and handles where it curves. */
export function isPathContour(value: unknown): value is PathContour {
	if (typeof value !== 'object' || value === null) return false;
	const contour = value as Record<string, unknown>;
	return (
		typeof contour.closed === 'boolean' &&
		Array.isArray(contour.nodes) &&
		contour.nodes.length > 0 &&
		contour.nodes.every((node: unknown) => {
			const { point, in: arriving, out: leaving } = (node ?? {}) as Record<string, unknown>;
			return isPoint(point) && (arriving === undefined || isPoint(arriving)) && (leaving === undefined || isPoint(leaving));
		})
	);
}

function isPoint(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const { x, y } = value as Record<string, unknown>;
	return Number.isFinite(x) && Number.isFinite(y);
}
