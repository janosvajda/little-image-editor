import { describe, expect, it } from 'vitest';
import { renderPixelPencilSegment } from './pixelPencilRenderer';

const MAXIMUM_TESTED_DIAMETER = 24;
const PIXEL_CENTER_OFFSET = 0.5;
const HALF = 2;
const Positions = [
	{ x: 10, y: 10 },
	{ x: 10.5, y: 10.5 },
	{ x: 7.25, y: 3.75 },
] as const;

/** Every pixel a set of fillRect calls covers, as "x,y" keys. */
function coveredByFillRects(diameter: number, at: { x: number; y: number }): Set<string> {
	const covered = new Set<string>();
	const context = {
		fillRect: (x: number, y: number, width: number, height: number) => {
			for (let row = y; row < y + height; row += 1)
				for (let column = x; column < x + width; column += 1)
					covered.add(`${column},${row}`);
		},
	} as unknown as CanvasRenderingContext2D;
	renderPixelPencilSegment(context, at, at, diameter);
	return covered;
}

/** The disc a pencil stamp is defined to paint, tested pixel by pixel. */
function expectedDisc(diameter: number, at: { x: number; y: number }): Set<string> {
	const covered = new Set<string>();
	const cell = { x: Math.floor(at.x), y: Math.floor(at.y) };
	const radius = diameter / HALF;
	const offset = diameter % HALF === 0 ? 0 : PIXEL_CENTER_OFFSET;
	const center = { x: cell.x + offset, y: cell.y + offset };
	const left = Math.round(center.x - radius);
	const top = Math.round(center.y - radius);
	for (let y = 0; y < diameter; y += 1)
		for (let x = 0; x < diameter; x += 1) {
			const dx = left + x + PIXEL_CENTER_OFFSET - center.x;
			const dy = top + y + PIXEL_CENTER_OFFSET - center.y;
			if (dx * dx + dy * dy <= radius * radius) covered.add(`${left + x},${top + y}`);
		}
	return covered;
}

describe('pixel pencil row spans', () => {
	it('paint exactly the pixels of the pencil disc', () => {
		for (let diameter = 2; diameter <= MAXIMUM_TESTED_DIAMETER; diameter += 1)
			for (const at of Positions)
				expect(coveredByFillRects(diameter, at)).toEqual(expectedDisc(diameter, at));
	});

	it('use one fill per covered row instead of one per pixel', () => {
		let fills = 0;
		const context = { fillRect: () => (fills += 1) } as unknown as CanvasRenderingContext2D;
		const diameter = MAXIMUM_TESTED_DIAMETER;
		renderPixelPencilSegment(context, Positions[0], Positions[0], diameter);
		expect(fills).toBe(diameter);
	});
});
