import type { Point } from '../../core/document/appTypes';
import { LineEnd } from './lineEnd';


/** The filled arrowhead shared by arrows and connectors: its size grows with the line. */
const ArrowHeadMetrics = {
	MinimumLength: 10,
	LengthPerWidth: 4,
	/** The head's half angle is a sixth of a half turn: 30°. */
	AngleDivisor: 6,
	/** A diamond is longer than an arrowhead, and a third as wide as it is long on each side. */
	DiamondLengthFactor: 1.5,
	DiamondHalfWidthFactor: 3,
	/** A circle's diameter, and a cross's distance from the tip and half size, as parts of an arrowhead's length. */
	CircleDiameterFactor: 0.8,
	CrossFactor: 0.5,
} as const;
const HALF = 2;

/** How far an arrowhead reaches back from the tip of a line this wide. */
export function arrowHeadLength(width: number): number {
	return Math.max(ArrowHeadMetrics.MinimumLength, width * ArrowHeadMetrics.LengthPerWidth);
}

/** How far an end reaches back from the tip, which is also how far it can reach beyond the line. */
export function lineEndLength(width: number, end: LineEnd): number {
	const head = arrowHeadLength(width);
	switch (end) {
		case LineEnd.None:
			return 0;
		case LineEnd.Diamond:
		case LineEnd.FilledDiamond:
			return head * ArrowHeadMetrics.DiamondLengthFactor;
		case LineEnd.Circle:
			return head * ArrowHeadMetrics.CircleDiameterFactor;
		default:
			return head;
	}
}

/** Where the line itself stops before its end: at the back of a hollow end, at the tip otherwise. */
export function lineEndInset(width: number, end: LineEnd): number {
	return end === LineEnd.Triangle || end === LineEnd.Diamond || end === LineEnd.Circle ? lineEndLength(width, end) : 0;
}

/** Fills an arrowhead at `to`, pointing away from `from`, in the context's fill colour. */
export function fillArrowHead(context: CanvasRenderingContext2D, from: Point, to: Point, width: number): void {
	context.beginPath();
	arrowPath(context, from, to, width, true);
	context.fill();
}

/** Draws an end at `to`, pointing away from `from`, in the context's stroke and fill colours. */
export function drawLineEnd(context: CanvasRenderingContext2D, from: Point, to: Point, width: number, end: LineEnd): void {
	switch (end) {
		case LineEnd.None:
			return;
		case LineEnd.Arrow:
			fillArrowHead(context, from, to, width);
			return;
		case LineEnd.OpenArrow:
			context.beginPath();
			arrowPath(context, from, to, width, false);
			context.stroke();
			return;
		case LineEnd.Triangle:
			context.beginPath();
			arrowPath(context, from, to, width, true);
			context.stroke();
			return;
		case LineEnd.Diamond:
		case LineEnd.FilledDiamond:
			context.beginPath();
			diamondPath(context, from, to, width);
			if (end === LineEnd.FilledDiamond) context.fill();
			context.stroke();
			return;
		case LineEnd.Circle:
			circleEnd(context, from, to, width);
			return;
		case LineEnd.Cross:
			crossEnd(context, from, to, width);
	}
}

/** A point `distance` back from `to` towards `from`, and `offset` to its side. */
function back(from: Point, to: Point, distance: number, offset = 0): Point {
	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	return {
		x: to.x - distance * Math.cos(angle) - offset * Math.sin(angle),
		y: to.y - distance * Math.sin(angle) + offset * Math.cos(angle),
	};
}

/** The two sides of an arrowhead; closed, its base too. */
function arrowPath(context: CanvasRenderingContext2D, from: Point, to: Point, width: number, closed: boolean): void {
	const head = arrowHeadLength(width);
	const spread = Math.PI / ArrowHeadMetrics.AngleDivisor;
	const left = back(from, to, head * Math.cos(spread), head * Math.sin(spread));
	const right = back(from, to, head * Math.cos(spread), -head * Math.sin(spread));
	context.moveTo(left.x, left.y);
	context.lineTo(to.x, to.y);
	context.lineTo(right.x, right.y);
	if (closed) context.closePath();
}

function diamondPath(context: CanvasRenderingContext2D, from: Point, to: Point, width: number): void {
	const length = lineEndLength(width, LineEnd.Diamond);
	const halfWidth = length / ArrowHeadMetrics.DiamondHalfWidthFactor;
	const corners = [back(from, to, length / HALF, halfWidth), back(from, to, length), back(from, to, length / HALF, -halfWidth)];
	context.moveTo(to.x, to.y);
	for (const corner of corners) context.lineTo(corner.x, corner.y);
	context.closePath();
}

function circleEnd(context: CanvasRenderingContext2D, from: Point, to: Point, width: number): void {
	const radius = lineEndLength(width, LineEnd.Circle) / HALF;
	const centre = back(from, to, radius);
	context.beginPath();
	context.arc(centre.x, centre.y, radius, 0, Math.PI * HALF);
	context.stroke();
}

function crossEnd(context: CanvasRenderingContext2D, from: Point, to: Point, width: number): void {
	const size = arrowHeadLength(width) * ArrowHeadMetrics.CrossFactor;
	const ends = [
		[back(from, to, 0, size), back(from, to, size * HALF, -size)],
		[back(from, to, 0, -size), back(from, to, size * HALF, size)],
	] as const;
	context.beginPath();
	for (const [start, end] of ends) {
		context.moveTo(start.x, start.y);
		context.lineTo(end.x, end.y);
	}
	context.stroke();
}
