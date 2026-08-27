import type { CropRect, Point } from '../../core/document/appTypes';

const DEFAULT_CELL_SIZE = 128;
const CELL_KEY_SEPARATOR = ':';
const EMPTY_CELL: ReadonlySet<string> = new Set<string>();

interface CellRange {
	readonly firstX: number;
	readonly lastX: number;
	readonly firstY: number;
	readonly lastY: number;
}

export class ObjectSpatialIndex {
	readonly #cells = new Map<string, Set<string>>();
	readonly #objectCells = new Map<string, readonly string[]>();
	readonly #objectRanges = new Map<string, CellRange>();

	constructor(private readonly cellSize = DEFAULT_CELL_SIZE) {}

	get size(): number {
		return this.#objectCells.size;
	}

	clear(): void {
		this.#cells.clear();
		this.#objectCells.clear();
		this.#objectRanges.clear();
	}

	set(id: string, bounds: CropRect, padding = 0): void {
		const range = this.cellRange(bounds, padding);
		if (sameRange(this.#objectRanges.get(id), range)) return;
		this.delete(id);
		const keys = this.cellKeys(range);
		this.#objectCells.set(id, keys);
		this.#objectRanges.set(id, range);
		for (const key of keys) {
			const ids = this.#cells.get(key) ?? new Set<string>();
			ids.add(id);
			this.#cells.set(key, ids);
		}
	}

	delete(id: string): void {
		const keys = this.#objectCells.get(id);
		if (!keys) return;
		for (const key of keys) {
			const ids = this.#cells.get(key);
			ids?.delete(id);
			if (ids?.size === 0) this.#cells.delete(key);
		}
		this.#objectCells.delete(id);
		this.#objectRanges.delete(id);
	}

	query(point: Point): ReadonlySet<string> {
		return this.#cells.get(this.key(point.x, point.y)) ?? EMPTY_CELL;
	}

	private cellRange(bounds: CropRect, padding: number): CellRange {
		const left = Math.min(bounds.x, bounds.x + bounds.width) - padding;
		const right = Math.max(bounds.x, bounds.x + bounds.width) + padding;
		const top = Math.min(bounds.y, bounds.y + bounds.height) - padding;
		const bottom = Math.max(bounds.y, bounds.y + bounds.height) + padding;
		return {
			firstX: this.coordinate(left),
			lastX: this.coordinate(right),
			firstY: this.coordinate(top),
			lastY: this.coordinate(bottom),
		};
	}

	private cellKeys(range: CellRange): readonly string[] {
		const keys: string[] = [];
		for (let y = range.firstY; y <= range.lastY; y += 1)
			for (let x = range.firstX; x <= range.lastX; x += 1)
				keys.push(`${x}${CELL_KEY_SEPARATOR}${y}`);
		return keys;
	}

	private key(x: number, y: number): string {
		return `${this.coordinate(x)}${CELL_KEY_SEPARATOR}${this.coordinate(y)}`;
	}

	private coordinate(value: number): number {
		return Math.floor(value / this.cellSize);
	}
}

function sameRange(left: CellRange | undefined, right: CellRange): boolean {
	return (
		left?.firstX === right.firstX &&
		left.lastX === right.lastX &&
		left.firstY === right.firstY &&
		left.lastY === right.lastY
	);
}
