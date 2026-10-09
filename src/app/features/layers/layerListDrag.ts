const DRAG_TARGET_CLASS = 'drag-target';
export const DRAG_SOURCE_CLASS = 'dragging-source';
const DRAGGING_HANDLE_CLASS = 'dragging';
const DRAG_PREVIEW_CLASS = 'layer-drag-preview';
const DRAG_SCROLL_EDGE_PIXELS = 36;
const DRAG_SCROLL_STEP_PIXELS = 18;
const DRAG_PREVIEW_OFFSET_PIXELS = 14;
const MOVING_PREFIX = 'Moving ';

/** What a row in the layer list stands for. */
export const LayerListEntryKind = { Layer: 'layer', Item: 'item' } as const;
export type LayerListEntryKind =
	(typeof LayerListEntryKind)[keyof typeof LayerListEntryKind];
export interface LayerListEntry {
	readonly kind: LayerListEntryKind;
	readonly id: string;
}

const ROW_SELECTOR = '[data-entry-kind]';

/** Drag-and-drop reordering of layer and item rows by their drag handles. */
export class LayerListDrag {
	#dragged: LayerListEntry | null = null;
	#pointerId: number | null = null;
	#preview: HTMLElement | null = null;

	constructor(
		private readonly list: HTMLElement,
		private readonly scroller: HTMLElement,
		private readonly drop: (dragged: LayerListEntry, target: LayerListEntry) => void,
	) {}

	isDragging(entry: LayerListEntry): boolean {
		return (
			this.#dragged?.kind === entry.kind && this.#dragged.id === entry.id
		);
	}

	/** Makes `handle` start dragging the row it belongs to. */
	bind(handle: HTMLElement, row: HTMLElement, entry: LayerListEntry, label: string): void {
		handle.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.#dragged = entry;
			this.#pointerId = event.pointerId;
			handle.setPointerCapture(event.pointerId);
			handle.classList.add(DRAGGING_HANDLE_CLASS);
			row.classList.add(DRAG_SOURCE_CLASS);
			this.#preview = createPreview(label);
			this.movePreview(event.clientX, event.clientY);
		});
		handle.addEventListener('pointermove', (event) => {
			if (event.pointerId !== this.#pointerId) return;
			this.movePreview(event.clientX, event.clientY);
			this.autoScroll(event.clientY);
			this.showTarget(event.clientX, event.clientY);
		});
		handle.addEventListener('pointerup', (event) => {
			if (event.pointerId !== this.#pointerId) return;
			const target = this.targetAt(event.clientX, event.clientY);
			const dragged = this.#dragged;
			this.finish();
			if (dragged && target && !sameEntry(dragged, target)) this.drop(dragged, target);
		});
		handle.addEventListener('pointercancel', () => this.finish());
	}

	private showTarget(clientX: number, clientY: number): void {
		this.clearTargets();
		const row = this.rowAt(clientX, clientY);
		const entry = row ? rowEntry(row) : null;
		if (row && entry && this.#dragged && !sameEntry(entry, this.#dragged))
			row.classList.add(DRAG_TARGET_CLASS);
	}

	private targetAt(clientX: number, clientY: number): LayerListEntry | null {
		const row = this.rowAt(clientX, clientY);
		return row ? rowEntry(row) : null;
	}

	private rowAt(clientX: number, clientY: number): HTMLElement | null {
		const hit = document
			.elementFromPoint(clientX, clientY)
			?.closest<HTMLElement>(ROW_SELECTOR);
		if (hit && this.list.contains(hit)) return hit;
		return (
			Array.from(this.list.querySelectorAll<HTMLElement>(ROW_SELECTOR)).find(
				(row) => {
					const bounds = row.getBoundingClientRect();
					return (
						clientX >= bounds.left &&
						clientX <= bounds.right &&
						clientY >= bounds.top &&
						clientY <= bounds.bottom
					);
				},
			) ?? null
		);
	}

	private autoScroll(clientY: number): void {
		const bounds = this.scroller.getBoundingClientRect();
		if (clientY < bounds.top + DRAG_SCROLL_EDGE_PIXELS)
			this.scroller.scrollTop -= DRAG_SCROLL_STEP_PIXELS;
		else if (clientY > bounds.bottom - DRAG_SCROLL_EDGE_PIXELS)
			this.scroller.scrollTop += DRAG_SCROLL_STEP_PIXELS;
	}

	private movePreview(clientX: number, clientY: number): void {
		if (!this.#preview) return;
		this.#preview.style.transform = `translate(${clientX + DRAG_PREVIEW_OFFSET_PIXELS}px, ${clientY + DRAG_PREVIEW_OFFSET_PIXELS}px)`;
	}

	private finish(): void {
		this.#dragged = null;
		this.#pointerId = null;
		for (const handle of this.list.querySelectorAll(`.${DRAGGING_HANDLE_CLASS}`))
			handle.classList.remove(DRAGGING_HANDLE_CLASS);
		for (const row of this.list.querySelectorAll(`.${DRAG_SOURCE_CLASS}`))
			row.classList.remove(DRAG_SOURCE_CLASS);
		this.#preview?.remove();
		this.#preview = null;
		this.clearTargets();
	}

	private clearTargets(): void {
		for (const row of this.list.querySelectorAll(`.${DRAG_TARGET_CLASS}`))
			row.classList.remove(DRAG_TARGET_CLASS);
	}
}

/** Marks a row as the given entry, for drop targeting. */
export function markRowEntry(row: HTMLElement, entry: LayerListEntry): void {
	row.dataset.entryKind = entry.kind;
	row.dataset.entryId = entry.id;
}

function rowEntry(row: HTMLElement): LayerListEntry | null {
	const { entryKind, entryId } = row.dataset;
	return (entryKind === LayerListEntryKind.Layer ||
		entryKind === LayerListEntryKind.Item) &&
		entryId
		? { kind: entryKind, id: entryId }
		: null;
}

function sameEntry(left: LayerListEntry, right: LayerListEntry): boolean {
	return left.kind === right.kind && left.id === right.id;
}

function createPreview(label: string): HTMLElement {
	const preview = document.createElement('div');
	preview.className = DRAG_PREVIEW_CLASS;
	preview.textContent = `${MOVING_PREFIX}${label}`;
	document.body.append(preview);
	return preview;
}
