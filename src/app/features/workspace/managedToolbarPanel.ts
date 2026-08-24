export interface ToolbarPanelState {
	readonly x: number;
	readonly y: number;
	readonly collapsed: boolean;
	readonly visible: boolean;
}

export const ToolbarDock = { Left: 'left', Right: 'right' } as const;
export type ToolbarDock = (typeof ToolbarDock)[keyof typeof ToolbarDock];
export interface ToolbarVisibilityDetail {
	readonly visible: boolean;
}
export const TOOLBAR_VISIBILITY_EVENT = 'toolbar:visibility-change';
export const TOOLBAR_AUTO_OPEN_EVENT = 'toolbar:auto-open';

export class ManagedToolbarPanel {
	readonly key: string;
	readonly header: HTMLElement;
	readonly collapseButton: HTMLButtonElement;
	readonly title: string;
	readonly defaultVisible: boolean;
	readonly autoOpenMode: string | undefined;
	readonly defaultDock: ToolbarDock;
	#collapseListeners = new Set<(collapsed: boolean) => void>();

	constructor(readonly element: HTMLElement) {
		const key = element.dataset.panel;
		if (!key)
			throw new Error('Managed toolbar panels require a data-panel key.');
		this.key = key;
		this.header = required<HTMLElement>(element, '.panel-header');
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

	setVisible(visible: boolean): boolean {
		if (this.visible === visible) return false;
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
		this.setVisible(state?.visible ?? this.defaultVisible);
		this.setCollapsed(state?.collapsed ?? false);
	}

	reset(): void {
		this.element.style.removeProperty('left');
		this.element.style.removeProperty('right');
		this.element.style.removeProperty('top');
		this.restore();
	}

	snapshot(): ToolbarPanelState {
		return {
			x: this.element.offsetLeft,
			y: this.element.offsetTop,
			collapsed: this.collapsed,
			visible: this.visible,
		};
	}

	onCollapseChange(listener: (collapsed: boolean) => void): void {
		this.#collapseListeners.add(listener);
	}

	private updateCollapsePresentation(): void {
		const action = this.collapsed ? 'Expand' : 'Collapse';
		this.collapseButton.textContent = this.collapsed ? '+' : '−';
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
