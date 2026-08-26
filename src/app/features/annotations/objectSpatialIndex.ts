import type { CropRect, Point } from '../../core/document/appTypes';

const DEFAULT_CELL_SIZE = 128;
const CELL_KEY_SEPARATOR = ':';

export class ObjectSpatialIndex {
	readonly #cells = new Map<string, Set<string>>();
	readonly #objectCells = new Map<string, readonly string[]>();

	constructor(private readonly cellSize = DEFAULT_CELL_SIZE) {}

	get size(): number {
		return this.#objectCells.size;
	}

	clear(): void {
		this.#cells.clear();
		this.#objectCells.clear();
	}

	set(id: string, bounds: CropRect, padding = 0): void {
		this.delete(id);
		const keys = this.cellKeys(bounds, padding);
		this.#objectCells.set(id, keys);
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
	}

	query(point: Point): ReadonlySet<string> {
		return this.#cells.get(this.key(point.x, point.y)) ?? new Set<string>();
	}

	private cellKeys(bounds: CropRect, padding: number): readonly string[] {
		const left = Math.min(bounds.x, bounds.x + bounds.width) - padding;
		const right = Math.max(bounds.x, bounds.x + bounds.width) + padding;
		const top = Math.min(bounds.y, bounds.y + bounds.height) - padding;
		const bottom = Math.max(bounds.y, bounds.y + bounds.height) + padding;
		const keys: string[] = [];
		const firstX = this.coordinate(left);
		const lastX = this.coordinate(right);
		const firstY = this.coordinate(top);
		const lastY = this.coordinate(bottom);
		for (let y = firstY; y <= lastY; y += 1)
			for (let x = firstX; x <= lastX; x += 1)
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
