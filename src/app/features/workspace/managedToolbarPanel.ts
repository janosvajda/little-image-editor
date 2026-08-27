export interface ToolbarPanelState {
	readonly x: number;
	readonly y: number;
	readonly collapsed: boolean;
	readonly visible: boolean;
	readonly positioned?: boolean;
}

interface ToolbarPanelPosition {
	readonly x: number;
	readonly y: number;
}

export const ToolbarDock = { Left: 'left', Right: 'right' } as const;
export type ToolbarDock = (typeof ToolbarDock)[keyof typeof ToolbarDock];
export interface ToolbarVisibilityDetail {
	readonly visible: boolean;
}
export interface ToolbarAvailabilitySource {
	readonly hasImage: boolean;
	onDocumentChange(
		listener: (snapshot: Readonly<{ hasImage: boolean }>) => void,
	): void;
}
export const TOOLBAR_VISIBILITY_EVENT = 'toolbar:visibility-change';
export const TOOLBAR_AUTO_OPEN_EVENT = 'toolbar:auto-open';
const CLOSE_BUTTON_CLASS = 'panel-close';
const CLOSE_BUTTON_SYMBOL = '×';
const EXPAND_BUTTON_SYMBOL = '+';
const COLLAPSE_BUTTON_SYMBOL = '−';
const PANEL_TOP_PROPERTY = '--toolbar-panel-top';

export class ManagedToolbarPanel {
	readonly key: string;
	readonly header: HTMLElement;
	readonly body: HTMLFieldSetElement;
	readonly collapseButton: HTMLButtonElement;
	readonly closeButton: HTMLButtonElement;
	readonly title: string;
	readonly defaultVisible: boolean;
	readonly autoOpenMode: string | undefined;
	readonly defaultDock: ToolbarDock;
	#collapseListeners = new Set<(collapsed: boolean) => void>();
	#lastPosition: ToolbarPanelPosition | undefined;
	#preferredPosition: ToolbarPanelPosition | undefined;

	constructor(readonly element: HTMLElement) {
		const key = element.dataset.panel;
		if (!key)
			throw new Error('Managed toolbar panels require a data-panel key.');
		this.key = key;
		this.header = required<HTMLElement>(element, '.panel-header');
		this.body = this.ensureEditingFieldset();
		this.collapseButton = required<HTMLButtonElement>(this.header, '.collapse');
		this.title =
			required<HTMLElement>(this.header, 'span').textContent?.trim() ||
			'Toolbar';
		this.defaultVisible = element.hasAttribute('data-default-visible');
		this.autoOpenMode = element.dataset.autoOpenMode;
		this.defaultDock =
			element.dataset.defaultDock === ToolbarDock.Left
				? ToolbarDock.Left
				: ToolbarDock.Right;
		element.dataset.toolbarPanel = 'managed';
		this.closeButton = this.createCloseButton();
		this.updateCollapsePresentation();
		this.collapseButton.addEventListener('click', () => {
			this.setCollapsed(!this.collapsed);
			this.#collapseListeners.forEach((listener) => listener(this.collapsed));
		});
	}

	get visible(): boolean {
		return !this.element.hidden;
	}
	get collapsed(): boolean {
		return this.element.classList.contains('collapsed');
	}
	get positioned(): boolean {
		return this.preferredPosition !== undefined;
	}
	get preferredPosition(): ToolbarPanelPosition | undefined {
		return this.#preferredPosition ?? this.inlinePosition;
	}
	get rendered(): boolean {
		return this.visible && this.element.offsetParent !== null;
	}
	get mounted(): boolean {
		return this.element.offsetParent !== null;
	}
	get position(): Readonly<{ x: number; y: number }> {
		if (this.rendered)
			return { x: this.element.offsetLeft, y: this.element.offsetTop };
		const inlinePosition = this.inlinePosition;
		if (inlinePosition) return inlinePosition;
		return (
			this.#lastPosition ?? {
				x: this.element.offsetLeft,
				y: this.element.offsetTop,
			}
		);
	}
	get size(): Readonly<{ width: number; height: number }> {
		return {
			width: this.element.offsetWidth,
			height: this.element.offsetHeight,
		};
	}

	setPosition(position: Readonly<{ x: number; y: number }>): void {
		this.#preferredPosition = position;
		this.setResolvedPosition(position);
	}

	setResolvedPosition(position: ToolbarPanelPosition): void {
		this.#lastPosition = position;
		this.element.style.left = `${position.x}px`;
		this.element.style.top = `${position.y}px`;
		this.element.style.setProperty(PANEL_TOP_PROPERTY, `${position.y}px`);
		this.element.style.right = 'auto';
	}

	setVisible(visible: boolean): boolean {
		if (this.visible === visible) return false;
		if (!visible)
			this.#lastPosition = {
				x: this.element.offsetLeft,
				y: this.element.offsetTop,
			};
		this.element.hidden = !visible;
		this.element.dispatchEvent(
			new CustomEvent<ToolbarVisibilityDetail>(TOOLBAR_VISIBILITY_EVENT, {
				bubbles: true,
				detail: { visible },
			}),
		);
		return true;
	}

	setCollapsed(collapsed: boolean): void {
		this.element.classList.toggle('collapsed', collapsed);
		this.updateCollapsePresentation();
	}

	restore(state?: ToolbarPanelState): void {
		if (state && (state.positioned ?? (state.x !== 0 || state.y !== 0)))
			this.setPosition(state);
		this.setVisible(state?.visible ?? this.defaultVisible);
		this.setCollapsed(state?.collapsed ?? false);
	}

	reset(): void {
		this.#lastPosition = undefined;
		this.#preferredPosition = undefined;
		this.element.style.removeProperty('left');
		this.element.style.removeProperty('right');
		this.element.style.removeProperty('top');
		this.element.style.removeProperty(PANEL_TOP_PROPERTY);
		this.restore();
	}

	snapshot(): ToolbarPanelState {
		const renderedPosition = this.position;
		if (
			this.rendered &&
			this.#lastPosition &&
			(renderedPosition.x !== this.#lastPosition.x ||
				renderedPosition.y !== this.#lastPosition.y)
		)
			this.#preferredPosition = renderedPosition;
		const position = this.#preferredPosition ?? renderedPosition;
		return {
			x: position.x,
			y: position.y,
			collapsed: this.collapsed,
			visible: this.visible,
			positioned: this.positioned,
		};
	}

	onCollapseChange(listener: (collapsed: boolean) => void): void {
		this.#collapseListeners.add(listener);
	}

	onCloseRequest(listener: () => void): void {
		this.closeButton.addEventListener('click', listener);
	}

	setEditingAvailable(available: boolean): void {
		this.body.disabled = !available;
		this.body.setAttribute('aria-disabled', String(!available));
		this.element.classList.toggle('editing-unavailable', !available);
	}

	private ensureEditingFieldset(): HTMLFieldSetElement {
		const current = required<HTMLElement>(this.element, '.panel-body');
		if (current instanceof HTMLFieldSetElement) return current;
		const fieldset = document.createElement('fieldset');
		for (const attribute of current.attributes)
			fieldset.setAttribute(attribute.name, attribute.value);
		fieldset.append(...current.childNodes);
		current.replaceWith(fieldset);
		return fieldset;
	}

	private get inlinePosition(): ToolbarPanelPosition | undefined {
		const x = Number.parseFloat(this.element.style.left);
		const y = Number.parseFloat(this.element.style.top);
		return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
	}

	private createCloseButton(): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = CLOSE_BUTTON_CLASS;
		button.textContent = CLOSE_BUTTON_SYMBOL;
		button.title = `Close ${this.title}`;
		button.setAttribute('aria-label', button.title);
		this.collapseButton.after(button);
		return button;
	}

	private updateCollapsePresentation(): void {
		const action = this.collapsed ? 'Expand' : 'Collapse';
		this.collapseButton.textContent = this.collapsed
			? EXPAND_BUTTON_SYMBOL
			: COLLAPSE_BUTTON_SYMBOL;
		this.collapseButton.title = `${action} ${this.title}`;
		this.collapseButton.setAttribute('aria-label', this.collapseButton.title);
		this.collapseButton.setAttribute('aria-expanded', String(!this.collapsed));
	}
}

export class ManagedToolbarRegistry {
	readonly panels: readonly ManagedToolbarPanel[];
	readonly #byKey: ReadonlyMap<string, ManagedToolbarPanel>;

	constructor(root: ParentNode = document) {
		this.panels = [
			...root.querySelectorAll<HTMLElement>('.panel[data-panel]'),
		].map((element) => new ManagedToolbarPanel(element));
		const entries = this.panels.map((panel) => [panel.key, panel] as const);
		if (new Set(entries.map(([key]) => key)).size !== entries.length)
			throw new Error('Managed toolbar keys must be unique.');
		this.#byKey = new Map(entries);
	}

	get(key: string): ManagedToolbarPanel | undefined {
		return this.#byKey.get(key);
	}

	findByAutoOpenMode(mode: string): ManagedToolbarPanel | undefined {
		return this.panels.find((panel) => panel.autoOpenMode === mode);
	}

	bindAvailability(source: ToolbarAvailabilitySource): void {
		source.onDocumentChange(({ hasImage }) =>
			this.panels.forEach((panel) => panel.setEditingAvailable(hasImage)),
		);
	}
}

function required<TElement extends Element>(
	root: ParentNode,
	selector: string,
): TElement {
	const result = root.querySelector<TElement>(selector);
	if (!result)
		throw new Error(`Managed toolbar is missing required element: ${selector}`);
	return result;
}
