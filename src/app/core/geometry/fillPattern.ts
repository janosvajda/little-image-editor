/**
 * Pattern fills, as SVG's `<pattern>` paints them: a small tile repeated
 * across an item, its first corner at the item's frame, so the pattern moves
 * with the item. One drawing of each tile serves the canvas and SVG export.
 */

export const PatternKind = { Stripes: 'stripes', Dots: 'dots', Grid: 'grid', Checks: 'checks' } as const;
export type PatternKind = (typeof PatternKind)[keyof typeof PatternKind];

export interface FillPattern {
	readonly kind: PatternKind;
	/** The pattern's own colour: its stripes, dots, lines or squares. */
	readonly color: string;
	/** What shows between them; nothing when left out. */
	readonly background?: string;
	/** The tile's side, in image pixels. */
	readonly size: number;
}

/** The tile a new pattern starts with. */
export const DEFAULT_PATTERN_SIZE = 12;
export const PatternSize = { Minimum: 4, Maximum: 64 } as const;

/** What drawing a tile needs from a canvas context, or from anything drawing like one. */
export interface PatternPainter {
	fillStyle: unknown;
	strokeStyle: unknown;
	lineWidth: number;
	beginPath(): void;
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	arc(x: number, y: number, radius: number, start: number, end: number): void;
	fill(): void;
	stroke(): void;
	fillRect(x: number, y: number, width: number, height: number): void;
}

const HALF = 2;
/** A stripe is a quarter of the tile wide, a grid line an eighth, and a dot's radius a fifth of the tile. */
const TileShare = { Stripe: 4, GridLine: 8, Dot: 5 } as const;
const FULL_TURN = Math.PI * HALF;

export function isPatternKind(value: unknown): value is PatternKind {
	return Object.values(PatternKind).some((kind) => kind === value);
}

/** A pattern of a kind in a colour, over a background when given. */
export function patternOf(kind: PatternKind, color: string, background?: string, size = DEFAULT_PATTERN_SIZE): FillPattern {
	return { kind, color, ...(background === undefined ? {} : { background }), size };
}

/** Whether a value read from a file is a pattern: a kind, a colour, perhaps a background, and a size in range. */
export function isFillPattern(value: unknown): value is FillPattern {
	if (typeof value !== 'object' || value === null) return false;
	const pattern = value as Record<string, unknown>;
	return (
		isPatternKind(pattern.kind) &&
		typeof pattern.color === 'string' &&
		(pattern.background === undefined || typeof pattern.background === 'string') &&
		typeof pattern.size === 'number' &&
		pattern.size >= PatternSize.Minimum &&
		pattern.size <= PatternSize.Maximum
	);
}

/** Draws one tile, from (0, 0) to (size, size), so tiles side by side join without seams. */
export function drawPatternTile(painter: PatternPainter, { kind, color, background, size }: FillPattern): void {
	if (background !== undefined) {
		painter.fillStyle = background;
		painter.fillRect(0, 0, size, size);
	}
	painter.fillStyle = color;
	painter.strokeStyle = color;
	TILE_DRAWINGS[kind](painter, size);
}

const TILE_DRAWINGS: Readonly<Record<PatternKind, (painter: PatternPainter, size: number) => void>> = {
	// Diagonal stripes, with the corners' halves drawn too so they meet the next tile's.
	[PatternKind.Stripes]: (painter, size) => {
		painter.lineWidth = size / TileShare.Stripe;
		painter.beginPath();
		for (const offset of [-size, 0, size]) {
			painter.moveTo(offset, size);
			painter.lineTo(offset + size, 0);
		}
		painter.stroke();
	},
	[PatternKind.Dots]: (painter, size) => {
		painter.beginPath();
		painter.arc(size / HALF, size / HALF, size / TileShare.Dot, 0, FULL_TURN);
		painter.fill();
	},
	[PatternKind.Grid]: (painter, size) => {
		const line = size / TileShare.GridLine;
		painter.fillRect(0, 0, size, line);
		painter.fillRect(0, 0, line, size);
	},
	[PatternKind.Checks]: (painter, size) => {
		const half = size / HALF;
		painter.fillRect(0, 0, half, half);
		painter.fillRect(half, half, half, half);
	},
};
