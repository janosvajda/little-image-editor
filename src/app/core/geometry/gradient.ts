import type { CropRect, Point } from '../document/appTypes';

/**
 * Gradients, as SVG paints them: linear along a line, or radial from a
 * centre out to a radius, through two or more colour stops. Their points are
 * kept relative to the item's frame, from 0 to 1 on each side, so a gradient
 * moves, stretches and turns with its item.
 */

export const GradientKind = { Linear: 'linear', Radial: 'radial' } as const;
export type GradientKind = (typeof GradientKind)[keyof typeof GradientKind];

export interface GradientStop {
	/** Where along the gradient, from 0 to 1. */
	readonly offset: number;
	readonly color: string;
}

export interface Gradient {
	readonly kind: GradientKind;
	readonly stops: readonly GradientStop[];
	/** Linear: where the first colour is; radial: the centre. Relative to the item's frame. */
	readonly start: Point;
	/** Linear: where the last colour is; radial: a point on the outer circle. Relative to the item's frame. */
	readonly end: Point;
}

export const MINIMUM_GRADIENT_STOPS = 2;
const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;
/** A linear gradient without an angle runs left to right. */
export const DEFAULT_GRADIENT_ANGLE = 0;

/** Colours spread evenly from the first to the last stop. */
export function evenStops(colors: readonly string[]): GradientStop[] {
	const last = Math.max(1, colors.length - 1);
	return colors.map((color, index) => ({ offset: index / last, color }));
}

/** A linear gradient through the frame's middle at an angle, in degrees clockwise from left-to-right. */
export function linearGradient(colors: readonly string[], angle: number = DEFAULT_GRADIENT_ANGLE): Gradient {
	const radians = (angle * Math.PI) / DEGREES_PER_HALF_TURN;
	const dx = Math.cos(radians) * HALF;
	const dy = Math.sin(radians) * HALF;
	return { kind: GradientKind.Linear, stops: evenStops(colors), start: { x: HALF - dx, y: HALF - dy }, end: { x: HALF + dx, y: HALF + dy } };
}

/** A radial gradient from the frame's middle out to its side. */
export function radialGradient(colors: readonly string[]): Gradient {
	return { kind: GradientKind.Radial, stops: evenStops(colors), start: { x: HALF, y: HALF }, end: { x: 1, y: HALF } };
}

/** A gradient of a kind through colours, a linear one at an angle in degrees clockwise from left-to-right. */
export function gradientOf(kind: GradientKind, colors: readonly string[], angle?: number): Gradient {
	return kind === GradientKind.Linear ? linearGradient(colors, angle) : radialGradient(colors);
}

/** A gradient of another kind with the same colours, laid out as that kind starts. */
export function withKind(gradient: Gradient, kind: GradientKind): Gradient {
	const colors = gradient.stops.map(({ color }) => color);
	return kind === GradientKind.Linear ? { ...linearGradient(colors), stops: gradient.stops } : { ...radialGradient(colors), stops: gradient.stops };
}

/** Where a relative point lands in a frame. */
export function inFrame(frame: CropRect, point: Point): Point {
	return { x: frame.x + point.x * frame.width, y: frame.y + point.y * frame.height };
}

/** Where a point lies relative to a frame; a frame with no width or height puts it in the middle that way. */
export function relativeToFrame(frame: CropRect, point: Point): Point {
	return {
		x: frame.width ? (point.x - frame.x) / frame.width : HALF,
		y: frame.height ? (point.y - frame.y) / frame.height : HALF,
	};
}

/** Whether a value read from a file is a gradient: a kind, two or more stops in order, and two points. */
export function isGradient(value: unknown): value is Gradient {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		Object.values(GradientKind).some((kind) => kind === candidate.kind) &&
		isRelativePoint(candidate.start) &&
		isRelativePoint(candidate.end) &&
		Array.isArray(candidate.stops) &&
		candidate.stops.length >= MINIMUM_GRADIENT_STOPS &&
		candidate.stops.every(isStop)
	);
}

function isStop(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const stop = value as Record<string, unknown>;
	return typeof stop.offset === 'number' && stop.offset >= 0 && stop.offset <= 1 && typeof stop.color === 'string' && stop.color.length > 0;
}

function isRelativePoint(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const point = value as Record<string, unknown>;
	return typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y);
}
