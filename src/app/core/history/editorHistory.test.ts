import { describe, expect, it } from 'vitest';
import {
	EditorHistory,
	type HistoryCommit,
	HistoryDomain,
	type HistoryParticipant,
} from './editorHistory';

const HISTORY_CAP = 3;

/** A minimal snapshot history with the same observable contract as the models. */
class FakeHistory implements HistoryParticipant {
	readonly #commitListeners = new Set<(commit: HistoryCommit) => void>();
	readonly #changeListeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	readonly #linkedSteps = new Map<number, FakeHistory>();
	#length = 1;
	#index = 0;

	constructor(private readonly cap = Number.POSITIVE_INFINITY) {}

	get canUndo(): boolean {
		return this.#index > 0;
	}
	get canRedo(): boolean {
		return this.#index < this.#length - 1;
	}
	get undoDepth(): number {
		return this.#index;
	}
	get position(): number {
		return this.#index;
	}

	onCommit(listener: (commit: HistoryCommit) => void): void {
		this.#commitListeners.add(listener);
	}
	onHistoryChange(listener: (canUndo: boolean, canRedo: boolean) => void): void {
		this.#changeListeners.add(listener);
	}

	/** `linked` is the model whose previous step this step also owns. */
	commit(linked: FakeHistory | null = null): void {
		this.#length = Math.min(this.#index + 2, this.cap + 1);
		this.#index = this.#length - 1;
		if (linked) this.#linkedSteps.set(this.#index, linked);
		this.#commitListeners.forEach((listener) =>
			listener({ absorbsPrevious: linked !== null }),
		);
		this.changed();
	}
	undo(): void {
		if (!this.canUndo) return;
		this.#linkedSteps.get(this.#index)?.undo();
		this.#index -= 1;
		this.changed();
	}
	redo(): void {
		if (!this.canRedo) return;
		this.#index += 1;
		this.#linkedSteps.get(this.#index)?.redo();
		this.changed();
	}
	/** Discards recent steps without an undo, like a gesture checkpoint restore. */
	rollBack(steps: number): void {
		this.#index -= steps;
		this.#length = this.#index + 1;
		this.changed();
	}
	reset(): void {
		this.#index = 0;
		this.#length = 1;
		this.changed();
	}

	private changed(): void {
		this.#changeListeners.forEach((listener) =>
			listener(this.canUndo, this.canRedo),
		);
	}
}

function setup(documentCap?: number): {
	readonly image: FakeHistory;
	readonly layers: FakeHistory;
	readonly history: EditorHistory;
} {
	const image = new FakeHistory(documentCap);
	const layers = new FakeHistory();
	const history = new EditorHistory({
		[HistoryDomain.Document]: image,
		[HistoryDomain.Objects]: layers,
	});
	return { image, layers, history };
}

describe('EditorHistory', () => {
	it('undoes and redoes steps from both models in chronological order', () => {
		const { image, layers, history } = setup();
		layers.commit();
		image.commit();
		layers.commit();

		history.undo();
		expect([image.position, layers.position]).toEqual([1, 1]);
		history.undo();
		expect([image.position, layers.position]).toEqual([0, 1]);
		history.undo();
		expect([image.position, layers.position]).toEqual([0, 0]);
		expect(history.canUndo).toBe(false);

		history.redo();
		history.redo();
		expect([image.position, layers.position]).toEqual([1, 1]);
		history.redo();
		expect([image.position, layers.position]).toEqual([1, 2]);
		expect(history.canRedo).toBe(false);
	});

	it('treats a linked layer step and the image step before it as one step', () => {
		const { image, layers, history } = setup();
		image.commit();
		layers.commit(image);

		history.undo();
		expect([image.position, layers.position]).toEqual([0, 0]);
		expect(history.canUndo).toBe(false);
		history.redo();
		expect([image.position, layers.position]).toEqual([1, 1]);
		expect(history.canRedo).toBe(false);
	});

	it('forgets steps a model rolls back without undoing them', () => {
		const { image, layers, history } = setup();
		image.commit();
		layers.commit();
		layers.commit();
		layers.rollBack(2);

		expect(history.canRedo).toBe(false);
		history.undo();
		expect(image.position).toBe(0);
		expect(history.canUndo).toBe(false);
	});

	it('drops the oldest steps that a capped model no longer keeps', () => {
		const { image, layers, history } = setup(HISTORY_CAP);
		layers.commit();
		for (let step = 0; step <= HISTORY_CAP; step += 1) image.commit();

		for (let step = 0; step < HISTORY_CAP; step += 1) history.undo();
		expect(image.position).toBe(0);
		history.undo();
		expect(layers.position).toBe(0);
	});

	it('uses recovered model history when no steps were made in this session', () => {
		const { image, layers, history } = setup();
		image.commit();
		layers.commit();
		image.reset();
		layers.reset();
		expect(history.canUndo).toBe(false);

		const recovered = setup();
		recovered.image.commit();
		recovered.layers.commit();
		const reopened = new EditorHistory({
			[HistoryDomain.Document]: recovered.image,
			[HistoryDomain.Objects]: recovered.layers,
		});
		reopened.undo();
		expect(recovered.layers.position).toBe(0);
		reopened.undo();
		expect(recovered.image.position).toBe(0);
		reopened.redo();
		expect(recovered.image.position).toBe(1);
	});

	it('notifies availability changes', () => {
		const { layers, history } = setup();
		const states: Array<readonly [boolean, boolean]> = [];
		history.onChange((canUndo, canRedo) => states.push([canUndo, canRedo]));
		layers.commit();
		history.undo();
		expect(states.at(0)).toEqual([false, false]);
		expect(states.at(-1)).toEqual([false, true]);
	});
});
