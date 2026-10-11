const COLOR_INPUT_SELECTOR = 'input[type="color"]';

/**
 * Remembers a colour input whose picker was opened with a click. The press
 * that closes such a picker, like any click outside a popup, only closes it:
 * it must not also reach the canvas and clear the selection the colour was
 * chosen for.
 */
export class ColorPickerGuard {
	#open: HTMLInputElement | null = null;

	constructor(root: Document = document) {
		// A colour opens only from its swatch: a press on its word or its row, which a label would pass on to the swatch, would open the picker again as it closes.
		root.addEventListener(
			'click',
			(event) => {
				const target = event.target;
				if (!(target instanceof Element) || target.matches(COLOR_INPUT_SELECTOR)) return;
				const control = target.closest('label')?.control;
				if (control instanceof HTMLInputElement && control.matches(COLOR_INPUT_SELECTOR)) event.preventDefault();
			},
			true,
		);
		// Heard after the input's own handlers, so a press that only made its swatch the active one, opening nothing, is not remembered.
		root.addEventListener('click', (event) => {
			const target = event.target;
			this.#open = !event.defaultPrevented && target instanceof HTMLInputElement && target.matches(COLOR_INPUT_SELECTOR) ? target : null;
		});
	}

	/** Whether this press only closes an open colour picker; the picker's input then lets go of the focus. */
	closesPicker(): boolean {
		const open = this.#open;
		this.#open = null;
		if (!open || open.ownerDocument.activeElement !== open) return false;
		open.blur();
		return true;
	}
}
