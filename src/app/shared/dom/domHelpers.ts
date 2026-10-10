export function element<T extends HTMLElement>(
	selector: string,
	root: ParentNode = document,
): T {
	const value = root.querySelector<T>(selector);
	if (!value) throw new Error(`Required element not found: ${selector}`);
	return value;
}

export function elements<T extends HTMLElement>(
	selector: string,
	root: ParentNode = document,
): T[] {
	return [...root.querySelectorAll<T>(selector)];
}

export function canvasContext(
	canvas: HTMLCanvasElement,
	options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
	const context = canvas.getContext('2d', options);
	if (!context) throw new Error('Canvas 2D is not supported by this browser');
	return context;
}

/** Inputs that are clicked or dragged rather than typed into, so letter keys stay shortcuts there. */
const NON_TYPING_INPUT_TYPES: ReadonlySet<string> = new Set([
	'range',
	'checkbox',
	'radio',
	'color',
	'button',
	'submit',
	'reset',
	'file',
	'image',
]);

/** Whether keys pressed in this element are typing, which keyboard shortcuts must leave alone. */
export function acceptsTyping(target: EventTarget | null): boolean {
	if (target instanceof HTMLInputElement) return !NON_TYPING_INPUT_TYPES.has(target.type);
	return (
		target instanceof HTMLSelectElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable === true)
	);
}
