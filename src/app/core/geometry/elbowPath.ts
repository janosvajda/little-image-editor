import type { Point } from '../document/appTypes';

const HALF = 2;

/**
 * A right-angled route from one point to another: out along the wider
 * direction, across at the middle, then in. Points in line need no bends.
 */
export function elbowPath(from: Point, to: Point): Point[] {
	if (from.x === to.x || from.y === to.y) return [from, to];
	if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
		const middle = (from.x + to.x) / HALF;
		return [from, { x: middle, y: from.y }, { x: middle, y: to.y }, to];
	}
	const middle = (from.y + to.y) / HALF;
	return [from, { x: from.x, y: middle }, { x: to.x, y: middle }, to];
}
