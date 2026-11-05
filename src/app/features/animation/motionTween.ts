import type { Gradient } from '../../core/geometry/gradient';
import { genericShape } from '../../core/geometry/genericShape';
import { Numeric } from '../../shared/math/numericConstants';
import type { AnnotationObject } from '../annotations/annotationTypes';
import { type MotionTween, RotateDirection } from './animationTypes';
import { lerp, lerpCssColor, lerpGradient, lerpPoint } from './colorInterpolation';
import { easeProgress } from './easing';
import { frameAroundPivot, itemPivot, pivotPoint, setItemPivot } from './itemPivot';

/**
 * A motion tween moves an item from how it is on one keyframe to how it is
 * on the next: its pivot travels in a straight line, and it turns, scales
 * and changes opacity and colour on the way. The item keeps the first
 * keyframe's drawing throughout; only its frame and style change, through
 * the same frame transform every item already supports.
 */

/** A tween's progress at `frame`, between its keyframe at `from` and the next keyframe at `to`. */
export function tweenProgress(frame: number, from: number, to: number): number {
	return to === from ? 1 : (frame - from) / (to - from);
}

/**
 * How far an item turns, in degrees clockwise, from rotation `from` to
 * rotation `to`, the given way round, with whole extra turns that way. Auto
 * goes the shorter way, clockwise for half a turn, and adds extra turns in
 * the direction it goes.
 */
export function rotationDelta(from: number, to: number, direction: RotateDirection, extraTurns: number): number {
	return turnDelta(from, to, direction, extraTurns, Numeric.DegreesPerTurn);
}

/** `rotationDelta` in any unit of angle, given how much a full turn is in it, such as 2π for radians. */
export function turnDelta(from: number, to: number, direction: RotateDirection, extraTurns: number, fullTurn: number): number {
	const extra = Math.max(0, Math.floor(extraTurns)) * fullTurn;
	const clockwise = positiveAngle(to - from, fullTurn);
	const halfTurn = fullTurn / Numeric.HalfDivisor;
	switch (direction) {
		case RotateDirection.Clockwise:
			return clockwise + extra;
		case RotateDirection.CounterClockwise:
			return (clockwise === 0 ? 0 : clockwise - fullTurn) - extra;
		case RotateDirection.Auto: {
			const shortest = clockwise > halfTurn ? clockwise - fullTurn : clockwise;
			return shortest + (shortest < 0 ? -extra : extra);
		}
	}
}

/**
 * The item between keyframe `from` and keyframe `to`, at progress `t` from 0
 * to 1 before easing. Items of different kinds cannot be tweened, so the
 * first is held.
 */
export function interpolateItem(from: AnnotationObject, to: AnnotationObject, tween: MotionTween, t: number): AnnotationObject {
	const item = structuredClone(from);
	if (from.type !== to.type) return item;
	const progress = easeProgress(tween.ease, t);
	const start = genericShape(from).geometry;
	const end = genericShape(to).geometry;
	const startRotation = start.rotation ?? 0;
	const rotation = startRotation + rotationDelta(startRotation, end.rotation ?? 0, tween.rotate, tween.extraTurns) * progress;
	const pivot = lerpPoint(itemPivot(from), itemPivot(to), progress);
	const size = { width: lerp(start.rect.width, end.rect.width, progress), height: lerp(start.rect.height, end.rect.height, progress) };
	const at = lerpPoint(pivotPoint(start, itemPivot(from)), pivotPoint(end, itemPivot(to)), progress);
	genericShape(item).setGeometry(frameAroundPivot(size, positiveDegrees(rotation), pivot, at));
	setItemPivot(item, pivot);
	tweenStyle(styleOf(item), styleOf(from), styleOf(to), progress);
	return item;
}

/** The style an item's kind may have that a motion tween changes. */
interface TweenedStyle {
	opacity?: number;
	color?: string;
	fillColor?: string;
	fillGradient?: Gradient;
	lineGradient?: Gradient;
}

/** The tweened style an item has; kinds without one of these properties simply leave it out. */
function styleOf(item: AnnotationObject): TweenedStyle {
	return item as TweenedStyle;
}

const COLOR_PROPERTIES = ['color', 'fillColor'] as const satisfies readonly (keyof TweenedStyle)[];
const GRADIENT_PROPERTIES = ['fillGradient', 'lineGradient'] as const satisfies readonly (keyof TweenedStyle)[];

/** Opacity, colours and gradients both keyframes give the item, at `progress` between them. */
function tweenStyle(target: TweenedStyle, from: TweenedStyle, to: TweenedStyle, progress: number): void {
	if (from.opacity !== undefined && to.opacity !== undefined) target.opacity = lerp(from.opacity, to.opacity, progress);
	for (const property of COLOR_PROPERTIES) {
		const start = from[property];
		const end = to[property];
		if (start !== undefined && end !== undefined) target[property] = lerpCssColor(start, end, progress);
	}
	for (const property of GRADIENT_PROPERTIES) {
		const start = from[property];
		const end = to[property];
		if (start && end) target[property] = lerpGradient(start, end, progress);
	}
}

function positiveDegrees(degrees: number): number {
	return positiveAngle(degrees, Numeric.DegreesPerTurn);
}

function positiveAngle(angle: number, fullTurn: number): number {
	return ((angle % fullTurn) + fullTurn) % fullTurn;
}
