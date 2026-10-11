import type { CropRect } from '../../core/document/appTypes';
import { drawPatternTile, type FillPattern } from '../../core/geometry/fillPattern';
import { canvasContext } from '../../shared/dom/domHelpers';

/**
 * Pattern fills on a canvas: each pattern's tile is drawn once and repeated
 * from the item's frame. A tile remembers the pattern it shows, so anything
 * drawing like a canvas, such as SVG export, can write the pattern itself.
 */

/** Tiles kept for reuse; beyond this many patterns at once, older tiles are drawn again when needed. */
const MAX_KEPT_TILES = 64;
const REPEAT = 'repeat';

const keptTiles = new Map<string, HTMLCanvasElement>();
const tilePatterns = new WeakMap<object, FillPattern>();

/** A pattern as paint, its tiles starting at the frame's corner; none where the context cannot make patterns. */
export function patternPaint(context: CanvasRenderingContext2D, pattern: FillPattern, frame: CropRect): CanvasPattern | null {
	const paint = context.createPattern(patternTile(pattern), REPEAT);
	paint?.setTransform({ a: 1, b: 0, c: 0, d: 1, e: frame.x, f: frame.y });
	return paint;
}

/** The pattern a tile shows; none for any other picture. */
export function patternOfTile(source: unknown): FillPattern | undefined {
	return typeof source === 'object' && source !== null ? tilePatterns.get(source) : undefined;
}

/** A pattern's tile, whole pixels on a side so tiles meet without seams. */
function patternTile(pattern: FillPattern): HTMLCanvasElement {
	const tilePattern = { ...pattern, size: Math.max(1, Math.round(pattern.size)) };
	const key = JSON.stringify(tilePattern);
	const kept = keptTiles.get(key);
	if (kept) return kept;
	if (keptTiles.size >= MAX_KEPT_TILES) keptTiles.clear();
	const tile = document.createElement('canvas');
	tile.width = tilePattern.size;
	tile.height = tilePattern.size;
	drawPatternTile(canvasContext(tile), tilePattern);
	tilePatterns.set(tile, tilePattern);
	keptTiles.set(key, tile);
	return tile;
}
