import { describe, expect, it } from 'vitest';
import {
	FillRule,
	flattenContour,
	mapPathPoints,
	type PathContour,
	PathDataError,
	pathBounds,
	pathContains,
	pathData,
	parsePathData,
	tracePath,
} from './vectorPath';

const square = (x: number, y: number, size: number): PathContour => ({
	closed: true,
	nodes: [{ point: { x, y } }, { point: { x: x + size, y } }, { point: { x: x + size, y: y + size } }, { point: { x, y: y + size } }],
});

describe('reading SVG path data', () => {
	it('reads absolute and relative lines, with repeated pairs after a move as lines', () => {
		expect(parsePathData('M10 10 L50 10 50 50z')).toEqual([square(10, 10, 40)].map((contour) => ({ ...contour, nodes: contour.nodes.slice(0, 3) })));
		expect(parsePathData('m10,10 40,0 0,40 h-40 Z')).toEqual([square(10, 10, 40)]);
		expect(parsePathData('M0 0 H20 V20')[0]!.nodes.map(({ point }) => point)).toEqual([
			{ x: 0, y: 0 },
			{ x: 20, y: 0 },
			{ x: 20, y: 20 },
		]);
	});

	it('reads cubic curves into node handles, and S as the reflection of the previous handle', () => {
		const [contour] = parsePathData('M0 0 C10 -10 30 -10 40 0 S70 10 80 0');
		expect(contour!.nodes).toEqual([
			{ point: { x: 0, y: 0 }, out: { x: 10, y: -10 } },
			{ point: { x: 40, y: 0 }, in: { x: 30, y: -10 }, out: { x: 50, y: 10 } },
			{ point: { x: 80, y: 0 }, in: { x: 70, y: 10 } },
		]);
	});

	it('reads quadratic curves and arcs as the cubic curves they equal', () => {
		const [quadratic] = parsePathData('M0 0 Q30 30 60 0 T120 0');
		expect(quadratic!.nodes[1]).toMatchObject({ point: { x: 60, y: 0 }, in: { x: 40, y: 20 } });
		expect(quadratic!.nodes[2]!.in!.y).toBeCloseTo(-20);
		// A half circle of radius 50 reaches 50 below its chord.
		const arc = parsePathData('M0 0 A50 50 0 0 0 100 0');
		expect(pathBounds(arc).height).toBeCloseTo(50, 0);
		expect(arc[0]!.nodes.at(-1)!.point).toEqual({ x: 100, y: 0 });
	});

	it('closes a contour that returns to its start without a doubled node', () => {
		const [contour] = parsePathData('M0 0 L10 0 L10 10 L0 0 Z');
		expect(contour!.nodes).toHaveLength(3);
		expect(contour!.closed).toBe(true);
	});

	it('keeps separate contours, and names what is wrong with broken data', () => {
		expect(parsePathData('M0 0 L10 0 M20 20 L30 30')).toHaveLength(2);
		expect(() => parsePathData('L10 10')).not.toThrow();
		expect(() => parsePathData('10 10')).toThrow(PathDataError);
		expect(() => parsePathData('M0 0 C10 10')).toThrow('C needs 6 numbers.');
		expect(() => parsePathData('M0 0 L10 10 #')).toThrow('Unexpected "#" in the path data.');
		expect(() => parsePathData('M5 5')).toThrow('The path data draws nothing.');
	});
});

describe('a vector path', () => {
	it('writes the same path back as absolute SVG path data', () => {
		const contours = parsePathData('m0 0 c10 -10 30 -10 40 0 l10 10 z');
		expect(pathData(contours)).toBe('M0 0C10 -10 30 -10 40 0L50 10Z');
		expect(parsePathData(pathData(contours))).toEqual(contours);
	});

	it('is framed by its curves at their furthest points, not by its handles', () => {
		const hump = parsePathData('M0 0 C0 -40 100 -40 100 0');
		expect(pathBounds(hump)).toEqual({ x: 0, y: -30, width: 100, height: 30 });
		expect(pathBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
	});

	it('fills by its fill rule: a hole in an even-odd shape is empty, in a non-zero one filled', () => {
		const ring = [square(0, 0, 100), square(25, 25, 50)];
		expect(pathContains(ring, { x: 10, y: 10 })).toBe(true);
		expect(pathContains(ring, { x: 50, y: 50 }, FillRule.EvenOdd)).toBe(false);
		expect(pathContains(ring, { x: 50, y: 50 }, FillRule.NonZero)).toBe(true);
		expect(pathContains(ring, { x: 150, y: 50 })).toBe(false);
	});

	it('flattens curves into short pieces, and moves every point and handle by one rule', () => {
		const [curve] = parsePathData('M0 0 C0 -40 100 -40 100 0');
		const points = flattenContour(curve!);
		expect(points.length).toBeGreaterThan(10);
		expect(points.at(-1)).toEqual({ x: 100, y: 0 });
		const moved = mapPathPoints([curve!], ({ x, y }) => ({ x: x + 5, y: y * 2 }));
		expect(moved[0]!.nodes[0]).toEqual({ point: { x: 5, y: 0 }, out: { x: 5, y: -80 } });
	});

	it('traces lines, curves and closings into a canvas path', () => {
		const calls: string[] = [];
		const record = (name: string) => () => void calls.push(name);
		tracePath({ moveTo: record('move'), lineTo: record('line'), bezierCurveTo: record('curve'), closePath: record('close') }, parsePathData('M0 0 C0 -40 100 -40 100 0 L50 50 Z'));
		expect(calls).toEqual(['move', 'curve', 'line', 'line', 'close']);
	});
});
