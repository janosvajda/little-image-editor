import type { KeyValueStorage } from '../../platform/editorPlatform';
import { createEditorIcon, EditorIconId } from '../../shared/style/editorIcons';
import { ToolbarId } from './toolbarTypes';

const DockClass = {
	Row: 'docked-workspace',
	Strip: 'dock-tool-strip',
	OptionsBar: 'dock-options-bar',
	SidePanel: 'dock-side-panel',
	PanelHeader: 'dock-panel-header',
	PanelTitle: 'dock-panel-title',
	PanelClose: 'dock-panel-close',
	Pages: 'dock-pages',
	Rail: 'dock-rail',
	RailButton: 'dock-rail-button',
	IconButton: 'icon-button',
	Active: 'dock-active',
} as const;
const DockText = {
	Tools: 'Tools',
	ToolOptions: 'Tool options',
	Toolbars: 'Toolbars',
	Close: 'Hide panel',
} as const;
const OPEN_PANEL_KEY = 'little-editor.docked-panel';
const PANEL_SELECTOR = '[data-panel]';
const PANEL_TITLE_SELECTOR = ':scope > .panel-header > span';
/** The most used toolbar leads the rail; the rest follow in page order. */
const LEADING_PANELS: readonly string[] = [ToolbarId.Layers];

type RailToolbarId = Exclude<ToolbarId, typeof ToolbarId.Tools>;
/** The host rail uses the same artwork as the shared toolbar views. */
const RAIL_ICONS: Readonly<Record<RailToolbarId, EditorIconId>> = {
	[ToolbarId.Layers]: EditorIconId.Layers,
	[ToolbarId.Adjust]: EditorIconId.Adjust,
	[ToolbarId.Effects]: EditorIconId.Effects,
	[ToolbarId.Annotations]: EditorIconId.Report,
	[ToolbarId.Transform]: EditorIconId.Transform,
};

/** The parts of the editor that the docked layout arranges. */
export interface DockedWorkspaceParts {
	readonly workspace: HTMLElement;
	/** The tool buttons; they go into the strip on the left. */
	readonly toolButtons: HTMLElement;
	/** The Tools toolbar; its settings become the options bar. */
	readonly toolSettings: HTMLElement;
	/** The quick action the options bar follows. */
	readonly optionsBarAfter: HTMLElement;
	/** Zoom and rulers; they go into the status bar. */
	readonly viewControls: HTMLElement;
	readonly statusBar: HTMLElement;
}

/**
 * Arranges the editor for a narrow editor area and gives the image as much of
 * it as possible: the tool buttons go into a strip on the left, the active
 * tool's settings into one bar beside the quick actions, zoom into the status
 * bar, and every other toolbar behind an icon on the right that opens it in
 * a side panel and hides it again. The toolbars keep their controls and
 * behaviour; only where they are shown changes.
 */
export class DockedWorkspace {
	readonly #sidePanel = document.createElement('aside');
	readonly #title = document.createElement('span');
	readonly #pages = document.createElement('div');
	readonly #rail = document.createElement('nav');
	readonly #panels = new Map<string, HTMLElement>();

	constructor(
		parts: DockedWorkspaceParts,
		private readonly storage: KeyValueStorage,
	) {
		const { workspace } = parts;
		const row = document.createElement('div');
		row.className = DockClass.Row;
		workspace.before(row);
		row.append(
			this.createStrip(parts.toolButtons),
			workspace,
			this.createSidePanel(),
			this.#rail,
		);
		parts.optionsBarAfter.after(this.createOptionsBar(parts.toolSettings));
		parts.statusBar.append(parts.viewControls);
		this.#rail.className = DockClass.Rail;
		// Hidden with the other controls in canvas focus mode.
		this.#rail.dataset.ui = '';
		this.#rail.setAttribute('aria-label', DockText.Toolbars);
		const panels = [...workspace.querySelectorAll<HTMLElement>(PANEL_SELECTOR)];
		for (const panel of inRailOrder(panels)) this.addPanel(panel);
		this.show(this.storage.getItem(OPEN_PANEL_KEY));
	}

	/** The toolbar shown in the side panel, or null while the panel is hidden. */
	get openPanel(): string | null {
		for (const [key, panel] of this.#panels)
			if (panel.classList.contains(DockClass.Active)) return key;
		return null;
	}

	/** Shows one toolbar in the side panel; null, or an unknown toolbar, hides the panel. */
	show(panelKey: string | null): void {
		const key = panelKey !== null && this.#panels.has(panelKey) ? panelKey : null;
		for (const [panelId, panel] of this.#panels) {
			const active = panelId === key;
			panel.classList.toggle(DockClass.Active, active);
			const button = this.#rail.querySelector<HTMLElement>(`[data-dock-panel="${panelId}"]`);
			button?.setAttribute('aria-pressed', String(active));
			button?.classList.toggle(DockClass.Active, active);
			if (active) this.#title.textContent = titleOf(panel);
		}
		this.#sidePanel.hidden = key === null;
		if (key === null) this.storage.removeItem(OPEN_PANEL_KEY);
		else this.storage.setItem(OPEN_PANEL_KEY, key);
	}

	/** Opens a toolbar, or hides the panel when that toolbar is already open. */
	toggle(panelKey: string): void {
		this.show(this.openPanel === panelKey ? null : panelKey);
	}

	private createStrip(toolButtons: HTMLElement): HTMLElement {
		const strip = document.createElement('nav');
		strip.className = DockClass.Strip;
		strip.dataset.ui = '';
		strip.setAttribute('aria-label', DockText.Tools);
		strip.append(toolButtons);
		return strip;
	}

	private createOptionsBar(toolSettings: HTMLElement): HTMLElement {
		const bar = document.createElement('div');
		bar.className = DockClass.OptionsBar;
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', DockText.ToolOptions);
		bar.append(toolSettings);
		return bar;
	}

	private createSidePanel(): HTMLElement {
		this.#sidePanel.className = DockClass.SidePanel;
		this.#sidePanel.dataset.ui = '';
		const header = document.createElement('header');
		header.className = DockClass.PanelHeader;
		this.#title.className = DockClass.PanelTitle;
		const close = document.createElement('button');
		close.type = 'button';
		close.className = `${DockClass.IconButton} ${DockClass.PanelClose}`;
		close.title = DockText.Close;
		close.setAttribute('aria-label', DockText.Close);
		close.append(createEditorIcon(EditorIconId.Close));
		close.addEventListener('click', () => this.show(null));
		header.append(this.#title, close);
		this.#pages.className = DockClass.Pages;
		this.#sidePanel.append(header, this.#pages);
		return this.#sidePanel;
	}

	private addPanel(panel: HTMLElement): void {
		const key = panel.dataset.panel;
		if (!key || key === ToolbarId.Tools) return;
		this.#panels.set(key, panel);
		this.#pages.append(panel);
		const title = titleOf(panel);
		const button = document.createElement('button');
		button.type = 'button';
		button.className = `${DockClass.IconButton} ${DockClass.RailButton}`;
		button.dataset.dockPanel = key;
		button.title = title;
		button.setAttribute('aria-label', title);
		button.append(createEditorIcon(isRailToolbar(key) ? RAIL_ICONS[key] : EditorIconId.Toolbars));
		button.addEventListener('click', () => this.toggle(key));
		this.#rail.append(button);
	}
}

function titleOf(panel: HTMLElement): string {
	return panel.querySelector(PANEL_TITLE_SELECTOR)?.textContent ?? panel.dataset.panel ?? '';
}

function isRailToolbar(key: string): key is RailToolbarId {
	return key in RAIL_ICONS;
}

function inRailOrder(panels: readonly HTMLElement[]): HTMLElement[] {
	const rank = (panel: HTMLElement) => {
		const index = LEADING_PANELS.indexOf(panel.dataset.panel ?? '');
		return index === -1 ? LEADING_PANELS.length : index;
	};
	return [...panels].sort((left, right) => rank(left) - rank(right));
}
