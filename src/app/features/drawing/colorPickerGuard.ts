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
		root.addEventListener(
			'click',
			(event) => {
				const target = event.target;
				this.#open = target instanceof HTMLInputElement && target.matches(COLOR_INPUT_SELECTOR) ? target : null;
			},
			true,
		);
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
