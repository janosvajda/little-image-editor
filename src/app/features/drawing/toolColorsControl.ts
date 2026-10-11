import { ColorPalette } from '../../core/document/colorPalette';
import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';

/**
 * The tools' two colours, as painting programs keep them: the line colour,
 * which brushes, lines, outlines and text use, and the fill colour, which
 * fills shapes and paths and is what the Fill tool pours. They belong to the
 * tools only: selecting an item never changes them, so swapping and
 * resetting always act on these two colours. One control, in every edition.
 */

/** Which of the two colours something sets. */
export const ToolColorTarget = { Line: 'line', Fill: 'fill' } as const;
export type ToolColorTarget = (typeof ToolColorTarget)[keyof typeof ToolColorTarget];

/** The colours a reset gives: a black line and a white fill. */
export const DEFAULT_TOOL_COLORS = { line: ColorPalette.Black, fill: ColorPalette.White } as const;

/** Keys that act on the colours: D resets them, Shift+X swaps them. */
export const ToolColorShortcut = { Reset: 'd', Swap: 'x' } as const;

const ColorAction = {
	Swap: { label: 'Swap line and fill colours (Shift+X)', icon: EditorIconId.SwapColors },
	Reset: { label: 'Reset colours to black and white (D)', icon: EditorIconId.Reset },
} as const;
/** Each colour's swatch: the word beside it, and its name for assistive technology. */
const SWATCHES: Readonly<Record<ToolColorTarget, { readonly label: string; readonly name: string }>> = {
	[ToolColorTarget.Line]: { label: 'Line', name: 'Line colour' },
	[ToolColorTarget.Fill]: { label: 'Fill', name: 'Fill colour' },
};

export class ToolColorsControl {
	readonly element = document.createElement('div');
	readonly #inputs: Readonly<Record<ToolColorTarget, HTMLInputElement>>;

	constructor(
		line: HTMLInputElement,
		fill: HTMLInputElement,
		/** Called after the colours change here, so they are remembered. */
		private readonly changed: () => void,
	) {
		// The tools' colours stay in view whatever is selected.
		this.element.className = 'tool-colors tool-option-persistent';
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', 'Colours');
		this.#inputs = { [ToolColorTarget.Line]: line, [ToolColorTarget.Fill]: fill };
		this.element.append(
			this.swatch(ToolColorTarget.Line),
			this.swatch(ToolColorTarget.Fill),
			this.button(ColorAction.Swap, () => this.swap()),
			this.button(ColorAction.Reset, () => this.reset()),
		);
	}

	get lineColor(): string {
		return this.#inputs[ToolColorTarget.Line].value;
	}
	get fillColor(): string {
		return this.#inputs[ToolColorTarget.Fill].value;
	}

	/** Makes a colour the line or the fill colour, as choosing it in the control does. */
	set(target: ToolColorTarget, color: string): void {
		this.#inputs[target].value = color;
		this.changed();
	}

	swap(): void {
		const line = this.lineColor;
		this.#inputs[ToolColorTarget.Line].value = this.fillColor;
		this.#inputs[ToolColorTarget.Fill].value = line;
		this.changed();
	}

	reset(): void {
		this.#inputs[ToolColorTarget.Line].value = DEFAULT_TOOL_COLORS.line;
		this.#inputs[ToolColorTarget.Fill].value = DEFAULT_TOOL_COLORS.fill;
		this.changed();
	}

	/** A colour's swatch with its word beside it; its old label, left empty, is removed. */
	private swatch(target: ToolColorTarget): HTMLLabelElement {
		const input = this.#inputs[target];
		const previous = input.closest('label');
		const label = document.createElement('label');
		label.className = 'tool-color';
		input.setAttribute('aria-label', SWATCHES[target].name);
		label.append(input, SWATCHES[target].label);
		if (previous && !previous.querySelector('input')) previous.remove();
		return label;
	}

	private button(action: (typeof ColorAction)[keyof typeof ColorAction], run: () => void): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'icon-button tool-colors-action';
		button.title = action.label;
		button.setAttribute('aria-label', action.label);
		button.innerHTML = editorIconMarkup(action.icon);
		button.addEventListener('click', run);
		return button;
	}
}
