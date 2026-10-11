import type { AnnotationDocument } from '../annotations/annotationDocument';
import type { AnnotationObject } from '../annotations/annotationTypes';

/**
 * Edits the selected item live from a control: each change while it is
 * being dragged or typed shows at once, and letting go makes one undo step.
 * Values shown on controls while they follow the selection edit nothing.
 */
export class LiveItemEdit {
	readonly #dirty = new Set<string>();
	#showing = false;

	constructor(private readonly objects: AnnotationDocument) {}

	/** Shows the selected item's values on controls, without editing it. */
	show(present: () => void): void {
		this.#showing = true;
		this.#dirty.clear();
		try {
			present();
		} finally {
			this.#showing = false;
		}
	}

	/** Edits the selected item from a control: `edit` changes it, `edited` follows each change. */
	bind<Value>(
		input: HTMLInputElement | HTMLSelectElement,
		key: string,
		read: () => Value,
		edit: (item: AnnotationObject, value: Value) => void,
		edited?: (value: Value) => void,
	): void {
		input.addEventListener('input', () => {
			this.#dirty.add(key);
			this.apply(read(), edit, edited);
		});
		input.addEventListener('change', () => {
			if (!this.#dirty.has(key)) this.apply(read(), edit, edited);
			this.#dirty.delete(key);
			if (!this.#showing && this.objects.selected) this.objects.commitCurrent();
		});
	}

	private apply<Value>(value: Value, edit: (item: AnnotationObject, value: Value) => void, edited?: (value: Value) => void): void {
		const selected = this.objects.selected;
		if (this.#showing || !selected) return;
		this.objects.update(selected.id, (item) => edit(item, value), false);
		edited?.(value);
	}
}
