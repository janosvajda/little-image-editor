import {
	TooltipAttribute,
	type TooltipConfiguration,
} from './tooltipConfiguration';

export interface TooltipView {
	readonly id: string;
	get hidden(): boolean;
	show(text: string): void;
	hide(): void;
	position(x: number, y: number): void;
}

export class DomTooltipView implements TooltipView {
	readonly #element: HTMLElement;
	constructor(
		documentRoot: Document,
		private readonly configuration: TooltipConfiguration,
	) {
		this.#element = documentRoot.createElement('div');
		this.#element.id = configuration.id;
		this.#element.className = configuration.className;
		this.#element.setAttribute(TooltipAttribute.Role, configuration.role);
		this.#element.hidden = true;
		documentRoot.body.append(this.#element);
	}
	get id(): string {
		return this.#element.id;
	}
	get hidden(): boolean {
		return Boolean(this.#element.hidden);
	}
	show(text: string): void {
		this.#element.textContent = text;
		this.#element.hidden = false;
	}
	hide(): void {
		this.#element.hidden = true;
	}
	position(x: number, y: number): void {
		const margin = this.configuration.viewportMarginPx;
		const left = clamp(
			x,
			margin,
			window.innerWidth - this.#element.offsetWidth - margin,
		);
		const top = clamp(
			y,
			margin,
			window.innerHeight - this.#element.offsetHeight - margin,
		);
		this.#element.style.left = `${left}px`;
		this.#element.style.top = `${top}px`;
	}
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(value, maximum));
}
