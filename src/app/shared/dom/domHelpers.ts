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
