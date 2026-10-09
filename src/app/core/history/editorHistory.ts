export const HistoryDomain = {
	Document: 'document',
	Objects: 'objects',
} as const;
export type HistoryDomain = (typeof HistoryDomain)[keyof typeof HistoryDomain];

/** A new step; `absorbsPrevious` marks a step that also undoes the step before it. */
export interface HistoryCommit {
	readonly absorbsPrevious: boolean;
}

/** One undoable model. It reports new steps; undo and redo are driven from here. */
export interface HistoryParticipant {
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	/** Number of steps that can currently be undone in this model. */
	readonly undoDepth: number;
	undo(): void;
	redo(): void;
	onCommit(listener: (commit: HistoryCommit) => void): void;
	onHistoryChange(listener: (canUndo: boolean, canRedo: boolean) => void): void;
}

/** Fallback order for steps made before this session, e.g. after a recovery reload. */
const RECOVERED_UNDO_ORDER: readonly HistoryDomain[] = [
	HistoryDomain.Objects,
	HistoryDomain.Document,
];
const RECOVERED_REDO_ORDER: readonly HistoryDomain[] = [
	HistoryDomain.Document,
	HistoryDomain.Objects,
];

/**
 * One chronological undo history over the image and its layers. Each domain
 * keeps its own snapshots; this keeps the order in which their steps were made.
 */
export class EditorHistory {
	readonly #participants: Readonly<Record<HistoryDomain, HistoryParticipant>>;
	readonly #listeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	#steps: HistoryDomain[] = [];
	#applied = 0;
	#navigating = false;

	constructor(participants: Readonly<Record<HistoryDomain, HistoryParticipant>>) {
		this.#participants = participants;
		for (const domain of Object.values(HistoryDomain)) {
			participants[domain].onCommit((commit) => this.record(domain, commit));
			participants[domain].onHistoryChange(() => this.reconcile());
		}
	}

	get canUndo(): boolean {
		return this.undoDomain() !== null;
	}

	get canRedo(): boolean {
		return this.redoDomain() !== null;
	}

	onChange(listener: (canUndo: boolean, canRedo: boolean) => void): void {
		this.#listeners.add(listener);
		listener(this.canUndo, this.canRedo);
	}

	undo(): void {
		const domain = this.undoDomain();
		if (!domain) return;
		if (this.#applied > 0) this.#applied -= 1;
		this.navigate(() => this.#participants[domain].undo());
	}

	redo(): void {
		const domain = this.redoDomain();
		if (!domain) return;
		if (this.#applied < this.#steps.length) this.#applied += 1;
		this.navigate(() => this.#participants[domain].redo());
	}

	private record(domain: HistoryDomain, commit: HistoryCommit): void {
		if (this.#navigating || !this.#participants[domain].canUndo) return;
		this.#steps.splice(this.#applied);
		if (commit.absorbsPrevious && this.#steps.at(-1) === HistoryDomain.Document)
			this.#steps.pop();
		this.#steps.push(domain);
		// A capped model forgets its oldest steps; forget them here as well.
		this.dropExcessSteps(domain, (indices) => indices.slice(0, -this.depth(domain)));
		this.#applied = this.#steps.length;
	}

	/** Drops steps a model rolled back or replaced without undoing them here. */
	private reconcile(): void {
		if (!this.#navigating)
			for (const domain of Object.values(HistoryDomain)) {
				this.dropExcessSteps(domain, (indices) => indices.slice(this.depth(domain)));
				if (!this.#participants[domain].canRedo)
					this.#steps = this.#steps.filter(
						(step, index) => index < this.#applied || step !== domain,
					);
			}
		this.emit();
	}

	private dropExcessSteps(
		domain: HistoryDomain,
		select: (appliedIndices: number[]) => number[],
	): void {
		const applied = this.#steps
			.slice(0, this.#applied)
			.flatMap((step, index) => (step === domain ? [index] : []));
		if (applied.length <= this.depth(domain)) return;
		const dropped = new Set(this.depth(domain) === 0 ? applied : select(applied));
		this.#steps = this.#steps.filter((_, index) => !dropped.has(index));
		this.#applied -= [...dropped].filter((index) => index < this.#applied).length;
	}

	private depth(domain: HistoryDomain): number {
		return this.#participants[domain].undoDepth;
	}

	private undoDomain(): HistoryDomain | null {
		const recorded = this.#steps[this.#applied - 1];
		if (recorded) return this.#participants[recorded].canUndo ? recorded : null;
		return (
			RECOVERED_UNDO_ORDER.find((domain) => this.#participants[domain].canUndo) ??
			null
		);
	}

	private redoDomain(): HistoryDomain | null {
		const recorded = this.#steps[this.#applied];
		if (recorded) return this.#participants[recorded].canRedo ? recorded : null;
		return (
			RECOVERED_REDO_ORDER.find((domain) => this.#participants[domain].canRedo) ??
			null
		);
	}

	private navigate(action: () => void): void {
		this.#navigating = true;
		try {
			action();
		} finally {
			this.#navigating = false;
		}
		this.emit();
	}

	private emit(): void {
		const { canUndo, canRedo } = this;
		this.#listeners.forEach((listener) => listener(canUndo, canRedo));
	}
}
