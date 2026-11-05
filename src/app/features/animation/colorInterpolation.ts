import type { Point } from '../../core/document/appTypes';
import { formatCssColor, parseCssColor, type Rgba } from '../../core/document/cssColor';
import type { Gradient, GradientStop } from '../../core/geometry/gradient';

/**
 * Values between two keyframes. Colours change channel by channel, red,
 * green, blue and alpha each linearly in sRGB. A colour that cannot be read
 * as channels, such as a named one, holds its first value until the next
 * keyframe; so does a gradient whose stops do not pair up with the other's.
 */

export function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}

export function lerpPoint(from: Point, to: Point, t: number): Point {
	return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

export function lerpRgba(from: Rgba, to: Rgba, t: number): Rgba {
	return [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t), lerp(from[3], to[3], t)];
}

/** A CSS colour between two others. */
export function lerpCssColor(from: string, to: string, t: number): string {
	if (from === to) return from;
	const start = parseCssColor(from);
	const end = parseCssColor(to);
	if (!start || !end) return held(from, to, t);
	return formatCssColor(lerpRgba(start, end, t));
}

/** A gradient between two of the same kind with as many stops; otherwise the first, held. */
export function lerpGradient(from: Gradient, to: Gradient, t: number): Gradient {
	if (from.kind !== to.kind || from.stops.length !== to.stops.length) return held(from, to, t);
	return {
		kind: from.kind,
		stops: from.stops.map((stop, index): GradientStop => {
			const target = to.stops[index]!;
			return { offset: lerp(stop.offset, target.offset, t), color: lerpCssColor(stop.color, target.color, t) };
		}),
		start: lerpPoint(from.start, to.start, t),
		end: lerpPoint(from.end, to.end, t),
	};
}

/** The first value until the second is reached. */
function held<Value>(from: Value, to: Value, t: number): Value {
	return t >= 1 ? to : from;
}
