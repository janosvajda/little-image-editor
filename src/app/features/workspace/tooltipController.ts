import {
	AccessibleTooltipContentResolver,
	type TooltipContentResolver,
} from './tooltipContentResolver';
import {
	DEFAULT_TOOLTIP_CONFIGURATION,
	TooltipAttribute,
	TooltipEvent,
	TooltipKeyboardNavigationKeys,
	type TooltipConfiguration,
} from './tooltipConfiguration';
import { DomTooltipView, type TooltipView } from './tooltipView';

export interface TooltipControllerDependencies {
	readonly content: TooltipContentResolver;
	readonly view: TooltipView;
	readonly configuration: TooltipConfiguration;
}

export class TooltipController {
	readonly #dependencies: TooltipControllerDependencies;
	#activeTarget: HTMLElement | null = null;
	#showTimer: number | null = null;
	#keyboardNavigation = false;

	constructor(
		readonly root: Document = document,
		dependencies?: Partial<TooltipControllerDependencies>,
	) {
		const configuration =
			dependencies?.configuration ?? DEFAULT_TOOLTIP_CONFIGURATION;
		this.#dependencies = {
			configuration,
			content: dependencies?.content ?? new AccessibleTooltipContentResolver(),
			view: dependencies?.view ?? new DomTooltipView(root, configuration),
		};
		this.bindEvents();
	}

	private bindEvents(): void {
		this.root.addEventListener(TooltipEvent.PointerOver, (event) =>
			this.onPointerOver(event as PointerEvent),
		);
		this.root.addEventListener(TooltipEvent.PointerOut, (event) =>
			this.onPointerOut(event as PointerEvent),
		);
		this.root.addEventListener(TooltipEvent.PointerMove, (event) =>
			this.positionFromPointer(event as PointerEvent),
		);
		this.root.addEventListener(
			TooltipEvent.PointerDown,
			() => {
				this.#keyboardNavigation = false;
				this.hide();
			},
			true,
		);
		this.root.addEventListener(
			TooltipEvent.KeyDown,
			(event) => this.onKeyDown(event as KeyboardEvent),
			true,
		);
		this.root.addEventListener(TooltipEvent.FocusIn, (event) => {
			if (this.#keyboardNavigation) this.showFor(this.target(event), true);
		});
		this.root.addEventListener(TooltipEvent.FocusOut, (event) => {
			if (this.target(event) === this.#activeTarget) this.hide();
		});
		window.addEventListener(TooltipEvent.WindowBlur, () => this.hide());
	}

	private target(event: Event): HTMLElement | null {
		return (
			(event.target as HTMLElement | null)?.closest<HTMLElement>(
				this.#dependencies.configuration.selector,
			) ?? null
		);
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (TooltipKeyboardNavigationKeys.has(event.key))
			this.#keyboardNavigation = true;
	}

	private onPointerOver(event: PointerEvent): void {
		this.#keyboardNavigation = false;
		const target = this.target(event);
		if (!target || target === this.#activeTarget) return;
		this.showFor(target, false, event.clientX, event.clientY);
	}

	private onPointerOut(event: PointerEvent): void {
		const target = this.target(event);
		if (!target || target !== this.#activeTarget) return;
		if (
			event.relatedTarget instanceof Node &&
			target.contains(event.relatedTarget)
		)
			return;
		this.hide();
	}

	private showFor(
		target: HTMLElement | null,
		immediate: boolean,
		x?: number,
		y?: number,
	): void {
		if (!target) return;
		this.hide();
		const text = this.#dependencies.content.resolve(target);
		if (!text) return;
		this.#activeTarget = target;
		target.setAttribute(
			TooltipAttribute.DescribedBy,
			this.#dependencies.view.id,
		);
		const show = () => this.showActiveTarget(target, text, x, y);
		if (immediate) show();
		else
			this.#showTimer = window.setTimeout(
				show,
				this.#dependencies.configuration.showDelayMs,
			);
	}

	private showActiveTarget(
		target: HTMLElement,
		text: string,
		x?: number,
		y?: number,
	): void {
		if (target !== this.#activeTarget) return;
		this.#dependencies.view.show(text);
		if (x === undefined || y === undefined) this.positionFromTarget(target);
		else this.positionFromPointerCoordinates(x, y);
	}

	private positionFromPointer(event: PointerEvent): void {
		if (this.#dependencies.view.hidden || !this.#activeTarget) return;
		this.positionFromPointerCoordinates(event.clientX, event.clientY);
	}

	private positionFromPointerCoordinates(x: number, y: number): void {
		const offset = this.#dependencies.configuration.pointerOffset;
		this.#dependencies.view.position(x + offset.x, y + offset.y);
	}

	private positionFromTarget(target: HTMLElement): void {
		const bounds = target.getBoundingClientRect();
		this.#dependencies.view.position(
			bounds.left + bounds.width / 2,
			bounds.bottom + this.#dependencies.configuration.targetOffsetY,
		);
	}

	private hide(): void {
		if (this.#showTimer !== null) window.clearTimeout(this.#showTimer);
		this.#showTimer = null;
		this.#activeTarget?.removeAttribute(TooltipAttribute.DescribedBy);
		this.#activeTarget = null;
		this.#dependencies.view.hide();
	}
}
