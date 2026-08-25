import { element, elements } from '../../shared/dom/domHelpers';
import { KeyboardKey } from '../../shared/input/keyboardKeys';
import {
	type ManagedToolbarPanel,
	ManagedToolbarRegistry,
	TOOLBAR_AUTO_OPEN_EVENT,
	type ToolbarAvailabilitySource,
} from './managedToolbarPanel';
import { ToolbarLayoutCoordinator } from './toolbarLayoutCoordinator';
import { ToolbarLayoutEngine } from './toolbarLayoutEngine';
import { ToolbarLayoutStore } from './toolbarLayoutStore';
import { ToolbarVisibilityPicker } from './toolbarVisibilityPicker';

const THEME_KEY = 'little-editor.theme.v1';
const PANEL_MARGIN = 14;
const PANEL_GAP = 14;
const STATUS_BAR_HEIGHT = 28;

export class WorkspaceUi {
	readonly workspace = element<HTMLElement>('.workspace');
	readonly toolbarRegistry = new ManagedToolbarRegistry();
	readonly toolbarPanels = this.toolbarRegistry.panels;
	readonly panels = this.toolbarPanels.map((panel) => panel.element);
	readonly toolbarLayout = new ToolbarLayoutCoordinator(
		this.toolbarPanels,
		new ToolbarLayoutEngine({ margin: PANEL_MARGIN, gap: PANEL_GAP }),
		{
			getBounds: () => ({
				width: this.workspaceWidth(),
				height: this.workspaceHeight(),
				bottomInset: STATUS_BAR_HEIGHT,
			}),
			isLayoutSuspended: () => document.body.classList.contains('focus-mode'),
		},
	);
	readonly menus = elements<HTMLDetailsElement>('.menu');
	readonly themeSelect = element<HTMLSelectElement>('#themeSelect');
	readonly toolbarPicker: ToolbarVisibilityPicker;
	#panelPreset: Map<string, boolean> | null = null;

	constructor(
		readonly dialogs: readonly HTMLDialogElement[],
		readonly toolbarLayoutStore = new ToolbarLayoutStore(),
	) {
		this.initializeFullscreenLabels();
		this.initializeMenus();
		this.initializePanels();
		this.toolbarPicker = new ToolbarVisibilityPicker(
			element('.toolbar'),
			this.toolbarPanels,
			(key, visible) => this.setPanelVisible(key, visible),
		);
		this.initializeTheme();
		this.bindViewEvents();
	}

	get resolvedTheme(): string {
		return this.resolveTheme(this.themeSelect.value);
	}

	bindToolbarAvailability(source: ToolbarAvailabilitySource): void {
		this.toolbarRegistry.bindAvailability(source);
	}

	setPanelVisible(key: string, visible: boolean): void {
		const panel = this.toolbarRegistry.get(key);
		if (!panel || panel.visible === visible) return;
		if (this.#panelPreset) {
			if (!visible && panel.autoOpenMode) {
				this.endPanelPreset();
				return;
			}
			this.#panelPreset = null;
		}
		this.applyPanelVisibility(panel, visible, true);
	}

	beginPanelPreset(visibleKeys: readonly string[]): void {
		if (!this.#panelPreset)
			this.#panelPreset = new Map(
				this.toolbarPanels.map((panel) => [panel.key, panel.visible]),
			);
		const visible = new Set(visibleKeys);
		this.toolbarPanels.forEach((panel) =>
			this.applyPanelVisibility(panel, visible.has(panel.key), false),
		);
	}

	commitPanelPreset(): void {
		if (!this.#panelPreset) return;
		this.#panelPreset = null;
		this.saveLayout();
	}

	autoOpenToolbar(mode: string): boolean {
		const panel = this.toolbarRegistry.findByAutoOpenMode(mode);
		if (!panel) return false;
		this.applyPanelVisibility(panel, true, true);
		panel.element.dispatchEvent(new CustomEvent(TOOLBAR_AUTO_OPEN_EVENT));
		return true;
	}

	endPanelPreset(): void {
		const preset = this.#panelPreset;
		if (!preset) return;
		this.#panelPreset = null;
		this.toolbarPanels.forEach((panel) =>
			this.applyPanelVisibility(panel, preset.get(panel.key) ?? false, false),
		);
		this.saveLayout();
	}

	private applyPanelVisibility(
		panel: ManagedToolbarPanel,
		visible: boolean,
		persist: boolean,
	): void {
		const preservePosition = panel.positioned;
		if (!panel.setVisible(visible)) return;
		this.toolbarPicker.sync(panel);
		if (persist) this.saveLayout();
		if (visible)
			requestAnimationFrame(() => {
				this.toolbarLayout.placeNew(panel, preservePosition);
				if (persist) this.saveLayout();
			});
	}

	private initializeFullscreenLabels(): void {
		element<HTMLElement>('#menuFocusButton span').textContent = 'Fullscreen';
		element<HTMLElement>('#focusButton').title = 'Fullscreen (Tab)';
		element<HTMLElement>('#exitFocusButton').textContent = 'Exit fullscreen';
		const help = document.querySelector<HTMLElement>('.status-help');
		if (help) help.textContent = 'Drag panels to arrange · Tab for fullscreen';
	}

	openFileMenu(): void {
		this.openMenu(element<HTMLDetailsElement>('#fileMenu'), true);
	}

	async toggleFocus(force?: boolean): Promise<void> {
		const enabled = force ?? !document.body.classList.contains('focus-mode');
		if (enabled) this.dialogs.forEach((dialog) => dialog.close());
		document.body.classList.toggle('focus-mode', enabled);
		if (enabled && !document.fullscreenElement)
			await document.documentElement.requestFullscreen().catch(() => undefined);
		if (!enabled && document.fullscreenElement)
			await document.exitFullscreen().catch(() => undefined);
		if (!enabled) requestAnimationFrame(() => this.clampAllPanels());
	}

	private initializeTheme(): void {
		const preference = localStorage.getItem(THEME_KEY) ?? 'auto';
		this.applyTheme(preference);
		this.themeSelect.addEventListener('change', () => {
			localStorage.setItem(THEME_KEY, this.themeSelect.value);
			this.applyTheme(this.themeSelect.value);
		});
		[
			matchMedia('(prefers-color-scheme: light)'),
			matchMedia('(prefers-contrast: more)'),
			matchMedia('(forced-colors: active)'),
		].forEach((query) =>
			query.addEventListener('change', () => {
				if (this.themeSelect.value === 'auto') this.applyTheme('auto');
			}),
		);
	}

	private resolveTheme(preference: string): string {
		if (preference !== 'auto') return preference;
		if (
			matchMedia('(forced-colors: active)').matches ||
			matchMedia('(prefers-contrast: more)').matches
		)
			return 'contrast';
		return matchMedia('(prefers-color-scheme: light)').matches
			? 'light'
			: 'dark';
	}

	private applyTheme(preference: string): void {
		document.documentElement.dataset.theme = this.resolveTheme(preference);
		this.themeSelect.value = preference;
	}

	private initializePanels(): void {
		const layout = this.toolbarLayoutStore.load();
		const hasSavedLayout = Object.keys(layout).length > 0;
		this.toolbarPanels.forEach((panel) => {
			const saved = layout[panel.key];
			panel.restore(saved);
			panel.header.addEventListener('pointerdown', (event) =>
				this.startPanelDrag(panel, event),
			);
			panel.onCloseRequest(() => this.setPanelVisible(panel.key, false));
			panel.onCollapseChange((collapsed) => {
				if (collapsed)
					this.toolbarLayout.constrain(
						panel,
						panel.position.x,
						panel.position.y,
					);
				else this.toolbarLayout.resolve(panel);
				this.saveLayout();
			});
		});
		requestAnimationFrame(() => {
			if (hasSavedLayout)
				this.toolbarPanels.forEach((panel) =>
					this.toolbarLayout.constrain(
						panel,
						panel.position.x,
						panel.position.y,
					),
				);
			else this.toolbarLayout.arrangeDefault();
			this.saveLayout();
		});
	}

	private startPanelDrag(
		panel: ManagedToolbarPanel,
		event: PointerEvent,
	): void {
		if ((event.target as HTMLElement).closest('button')) return;
		const origin = panel.position;
		const pointer = { x: event.clientX, y: event.clientY };
		panel.element.classList.add('dragging-panel');
		panel.header.setPointerCapture(event.pointerId);
		const move = (next: PointerEvent) =>
			this.toolbarLayout.move(
				panel,
				origin.x + next.clientX - pointer.x,
				origin.y + next.clientY - pointer.y,
			);
		const end = () => {
			panel.element.classList.remove('dragging-panel');
			panel.header.removeEventListener('pointermove', move);
			panel.header.removeEventListener('pointerup', end);
			panel.header.removeEventListener('pointercancel', end);
			this.toolbarLayout.resolve(panel);
			this.saveLayout();
		};
		panel.header.addEventListener('pointermove', move);
		panel.header.addEventListener('pointerup', end);
		panel.header.addEventListener('pointercancel', end);
	}

	private clampAllPanels(): void {
		this.toolbarLayout.resolveAll();
	}

	private workspaceWidth(): number {
		return (
			this.workspace.clientWidth ||
			document.documentElement.clientWidth ||
			window.innerWidth
		);
	}
	private workspaceHeight(): number {
		return (
			this.workspace.clientHeight ||
			document.documentElement.clientHeight ||
			window.innerHeight
		);
	}

	private saveLayout(): void {
		const layout = Object.fromEntries(
			this.toolbarPanels.map((panel) => [panel.key, panel.snapshot()]),
		);
		this.toolbarLayoutStore.save(layout);
	}

	private resetLayout(): void {
		this.#panelPreset = null;
		this.toolbarLayoutStore.clear();
		this.toolbarPanels.forEach((panel) => {
			panel.reset();
			this.toolbarPicker.sync(panel);
		});
		requestAnimationFrame(() => {
			this.toolbarLayout.arrangeDefault();
			this.saveLayout();
		});
	}

	private initializeMenus(): void {
		this.menus.forEach((menu) => {
			const summary = element<HTMLElement>('summary', menu);
			summary.setAttribute('aria-haspopup', 'menu');
			summary.setAttribute('aria-expanded', 'false');
			menu.addEventListener('toggle', () =>
				summary.setAttribute('aria-expanded', String(menu.open)),
			);
		});
		element('.menubar').addEventListener('keydown', (event) =>
			this.navigateMenu(event),
		);
		document.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;
			this.menus
				.filter((menu) => menu.open)
				.forEach((menu) => {
					if (!menu.contains(target) || target.closest('.menu-popover button'))
						this.closeMenu(menu);
				});
		});
	}

	private menuItems(menu: HTMLDetailsElement): HTMLElement[] {
		return elements<HTMLElement>(
			'.menu-popover button:not(:disabled), .menu-popover select',
			menu,
		);
	}

	private openMenu(menu: HTMLDetailsElement, focusItem = false): void {
		this.menus.forEach((other) => {
			if (other !== menu) this.closeMenu(other);
		});
		menu.open = true;
		if (focusItem) this.menuItems(menu)[0]?.focus();
	}

	private closeMenu(menu: HTMLDetailsElement, restoreFocus = false): void {
		menu.open = false;
		if (restoreFocus) element<HTMLElement>('summary', menu).focus();
	}

	private navigateMenu(event: KeyboardEvent): void {
		const target = event.target as HTMLElement;
		const menu = target.closest<HTMLDetailsElement>('.menu');
		if (!menu) return;
		if (target.tagName === 'SELECT') return;
		const items = this.menuItems(menu);
		const onSummary = target.matches('summary, summary *');
		if (this.navigateBetweenMenus(event, menu)) return;
		if (this.navigateWithinMenu(event, menu, target, items, onSummary)) return;
		if (this.toggleMenuFromSummary(event, menu, onSummary)) return;
		if (event.key === KeyboardKey.Escape) {
			event.preventDefault();
			this.closeMenu(menu, true);
			return;
		}
		this.focusTerminalMenu(event, onSummary);
	}

	private navigateBetweenMenus(
		event: KeyboardEvent,
		menu: HTMLDetailsElement,
	): boolean {
		if (
			event.key !== KeyboardKey.ArrowLeft &&
			event.key !== KeyboardKey.ArrowRight
		)
			return false;
		event.preventDefault();
		const offset = event.key === KeyboardKey.ArrowRight ? 1 : -1;
		const menuIndex = this.menus.indexOf(menu);
		const next =
			this.menus[(menuIndex + offset + this.menus.length) % this.menus.length]!;
		if (menu.open) this.openMenu(next, true);
		else element<HTMLElement>('summary', next).focus();
		return true;
	}

	private navigateWithinMenu(
		event: KeyboardEvent,
		menu: HTMLDetailsElement,
		target: HTMLElement,
		items: HTMLElement[],
		onSummary: boolean,
	): boolean {
		if (
			event.key !== KeyboardKey.ArrowDown &&
			event.key !== KeyboardKey.ArrowUp
		)
			return false;
		event.preventDefault();
		if (onSummary) {
			this.openMenu(menu, event.key === KeyboardKey.ArrowDown);
			if (event.key === KeyboardKey.ArrowUp) items.at(-1)?.focus();
			return true;
		}
		const direction = event.key === KeyboardKey.ArrowDown ? 1 : -1;
		const itemIndex = items.indexOf(target);
		items[(itemIndex + direction + items.length) % items.length]?.focus();
		return true;
	}

	private toggleMenuFromSummary(
		event: KeyboardEvent,
		menu: HTMLDetailsElement,
		onSummary: boolean,
	): boolean {
		if (
			!onSummary ||
			(event.key !== KeyboardKey.Enter && event.key !== KeyboardKey.Space)
		)
			return false;
		event.preventDefault();
		menu.open ? this.closeMenu(menu) : this.openMenu(menu, true);
		return true;
	}

	private focusTerminalMenu(event: KeyboardEvent, onSummary: boolean): void {
		if (
			!onSummary ||
			(event.key !== KeyboardKey.Home && event.key !== KeyboardKey.End)
		)
			return;
		event.preventDefault();
		const index = event.key === KeyboardKey.Home ? 0 : this.menus.length - 1;
		element<HTMLElement>('summary', this.menus[index]!).focus();
	}

	private bindViewEvents(): void {
		element('#focusButton').addEventListener(
			'click',
			() => void this.toggleFocus(),
		);
		element('#menuFocusButton').addEventListener(
			'click',
			() => void this.toggleFocus(),
		);
		element('#exitFocusButton').addEventListener(
			'click',
			() => void this.toggleFocus(false),
		);
		element('#resetLayoutButton').addEventListener('click', () =>
			this.resetLayout(),
		);
		document.addEventListener('fullscreenchange', () => {
			if (!document.fullscreenElement) {
				document.body.classList.remove('focus-mode');
				requestAnimationFrame(() => this.clampAllPanels());
			}
		});
		window.addEventListener('resize', () => {
			if (!document.body.classList.contains('focus-mode'))
				this.clampAllPanels();
		});
	}
}
