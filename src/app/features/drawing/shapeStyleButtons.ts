import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';
import { ShapeStyle } from '../annotations/shapeStyle';

/** Each style's name and picture, where a shape's style is chosen. */
const STYLE_CHOICES: Readonly<Record<ShapeStyle, { readonly label: string; readonly icon: EditorIconId }>> = {
	[ShapeStyle.Outline]: { label: 'Outline', icon: EditorIconId.ShapeOutline },
	[ShapeStyle.Fill]: { label: 'Fill', icon: EditorIconId.ShapeFill },
	[ShapeStyle.OutlineAndFill]: { label: 'Outline and fill', icon: EditorIconId.ShapeOutlineAndFill },
};
const GROUP_LABEL = 'Style';

/**
 * A shape's style as three buttons, as painting programs offer on their shape
 * tools: outline, fill, or both. The same buttons serve the shape tools and a
 * selected shape; each place says what a choice does.
 */
export class ShapeStyleButtons {
	readonly element = document.createElement('div');
	readonly #buttons: ReadonlyMap<ShapeStyle, HTMLButtonElement>;

	constructor(accessibleName: string, choose: (style: ShapeStyle) => void) {
		this.element.className = 'shape-style';
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', accessibleName);
		const label = document.createElement('span');
		label.className = 'shape-style-label';
		label.textContent = GROUP_LABEL;
		this.element.append(label);
		this.#buttons = new Map(
			Object.values(ShapeStyle).map((style) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'shape-style-button';
				button.dataset.shapeStyle = style;
				button.title = STYLE_CHOICES[style].label;
				button.setAttribute('aria-label', STYLE_CHOICES[style].label);
				button.innerHTML = `${editorIconMarkup(STYLE_CHOICES[style].icon)}<span>${STYLE_CHOICES[style].label}</span>`;
				button.addEventListener('click', () => choose(style));
				this.element.append(button);
				return [style, button] as const;
			}),
		);
	}

	/** Shows which style is chosen. */
	show(chosen: ShapeStyle): void {
		for (const [style, button] of this.#buttons) {
			button.classList.toggle('active', style === chosen);
			button.setAttribute('aria-pressed', String(style === chosen));
		}
	}
}
