import { type CubicBezierPoints, Ease, type EaseSpec } from './animationTypes';

/**
 * Eases map a tween's linear progress `t`, from 0 to 1, to the share of the
 * change shown at that moment. A custom ease is a CSS-style cubic Bézier:
 * its x is time and its y the share, so `t` is first solved for the curve
 * parameter whose x it is.
 */

/** How close a solved curve x must come to `t`. */
export const BEZIER_TOLERANCE = 1e-7;
const NEWTON_ITERATIONS = 8;
/** Below this slope a Newton step would overshoot, so bisection takes over. */
const MINIMUM_NEWTON_SLOPE = 1e-6;
const BISECTION_ITERATIONS = 64;
const HALF = 0.5;
const QUADRATIC = 2;
/** The factor of each control value in a cubic Bézier through 0 and 1: `3(1−s)²s·p1 + 3(1−s)s²·p2 + s³`. */
const BEZIER_CONTROL_FACTOR = 3;

/** The share of the change shown at progress `t`, which is clamped to 0..1. */
export function easeProgress(ease: EaseSpec, t: number): number {
	const progress = clampUnit(t);
	switch (ease.kind) {
		case Ease.Linear:
			return progress;
		case Ease.EaseIn:
			return progress ** QUADRATIC;
		case Ease.EaseOut:
			return 1 - (1 - progress) ** QUADRATIC;
		case Ease.EaseInOut:
			return progress < HALF ? QUADRATIC * progress ** QUADRATIC : 1 - (-QUADRATIC * progress + QUADRATIC) ** QUADRATIC / QUADRATIC;
		case Ease.Custom:
			return cubicBezierProgress(ease.points, progress);
	}
}

/** A CSS `cubic-bezier(x1, y1, x2, y2)` at time `t`: the curve's y where its x is `t`. */
export function cubicBezierProgress([x1, y1, x2, y2]: CubicBezierPoints, t: number): number {
	if (t <= 0 || t >= 1) return clampUnit(t);
	return bezierValue(y1, y2, solveBezierParameter(x1, x2, t));
}

/** The curve parameter whose x is `x`: Newton-Raphson, falling back to bisection where it does not converge. */
function solveBezierParameter(x1: number, x2: number, x: number): number {
	let parameter = x;
	for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration++) {
		const error = bezierValue(x1, x2, parameter) - x;
		if (Math.abs(error) < BEZIER_TOLERANCE) return parameter;
		const slope = bezierSlope(x1, x2, parameter);
		if (Math.abs(slope) < MINIMUM_NEWTON_SLOPE) break;
		parameter -= error / slope;
	}
	let low = 0;
	let high = 1;
	parameter = x;
	for (let iteration = 0; iteration < BISECTION_ITERATIONS; iteration++) {
		const value = bezierValue(x1, x2, parameter);
		if (Math.abs(value - x) < BEZIER_TOLERANCE) return parameter;
		if (value < x) low = parameter;
		else high = parameter;
		parameter = (low + high) * HALF;
	}
	return parameter;
}

/** `3(1−s)²s·p1 + 3(1−s)s²·p2 + s³`, written in powers of `s`. */
function bezierValue(p1: number, p2: number, s: number): number {
	const { a, b, c } = coefficients(p1, p2);
	return ((a * s + b) * s + c) * s;
}

function bezierSlope(p1: number, p2: number, s: number): number {
	const { a, b, c } = coefficients(p1, p2);
	return (BEZIER_CONTROL_FACTOR * a * s + QUADRATIC * b) * s + c;
}

function coefficients(p1: number, p2: number): { a: number; b: number; c: number } {
	const c = BEZIER_CONTROL_FACTOR * p1;
	const b = BEZIER_CONTROL_FACTOR * (p2 - p1) - c;
	return { a: 1 - c - b, b, c };
}

function clampUnit(value: number): number {
	return Math.min(1, Math.max(0, value));
}
