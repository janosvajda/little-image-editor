import { beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../../platform/editorPlatform';
import { DockedWorkspace, type DockedWorkspaceParts } from './dockedWorkspace';
import { ToolbarId } from './toolbarTypes';

const OPEN_PANEL_KEY = 'little-editor.docked-panel';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key),
	};
}

function panel(key: string, title: string): string {
	return `<section class="panel" data-panel="${key}"><header class="panel-header"><span>${title}</span></header><div class="panel-body"></div></section>`;
}

let parts: DockedWorkspaceParts;

beforeEach(() => {
	document.body.innerHTML = `<header class="topbar"><div class="toolbar"><button id="redoButton"></button><button id="focusButton"></button></div></header><main class="workspace">${panel(ToolbarId.Effects, 'Effects')}${panel(ToolbarId.Layers, 'Layers & Objects')}${panel(ToolbarId.Tools, 'Tools')}<footer id="statusBar"></footer></main>`;
	const toolButtons = document.createElement('div');
	toolButtons.innerHTML = '<button type="button">Brush</button>';
	document.querySelector('[data-panel="tools"] .panel-body')!.append(toolButtons);
	const viewControls = document.createElement('div');
	viewControls.className = 'viewport-controls';
	document.querySelector('.toolbar')!.append(viewControls);
	parts = {
		workspace: document.querySelector<HTMLElement>('.workspace')!,
		toolButtons,
		toolSettings: document.querySelector<HTMLElement>('[data-panel="tools"]')!,
		optionsBarAfter: document.querySelector<HTMLElement>('#redoButton')!,
		viewControls,
		statusBar: document.querySelector<HTMLElement>('#statusBar')!,
	};
});

describe('docked workspace', () => {
	it('puts the tools in a strip, their settings beside the quick actions, zoom in the status bar and the other toolbars behind icons', () => {
		new DockedWorkspace(parts, memoryStorage());
		expect(document.querySelector('.dock-tool-strip')?.contains(parts.toolButtons)).toBe(true);
		const optionsBar = document.querySelector('.dock-options-bar')!;
		expect(optionsBar.contains(parts.toolSettings)).toBe(true);
		expect(parts.optionsBarAfter.nextElementSibling).toBe(optionsBar);
		expect(parts.statusBar.contains(parts.viewControls)).toBe(true);
		const row = document.querySelector('.docked-workspace')!;
		expect([...row.children].map((part) => part.className)).toEqual([
			'dock-tool-strip',
			'workspace',
			'dock-side-panel',
			'dock-rail',
		]);
		const icons = [...document.querySelectorAll('.dock-rail-button')].map((button) => button.getAttribute('aria-label'));
		expect(icons).toEqual(['Layers & Objects', 'Effects']);
		// The image gets the whole area until a toolbar is opened.
		expect(document.querySelector<HTMLElement>('.dock-side-panel')!.hidden).toBe(true);
	});

	it('opens a toolbar from its icon, hides it on a second click or with close, and remembers the open one', () => {
		const storage = memoryStorage();
		const docked = new DockedWorkspace(parts, storage);
		const sidePanel = document.querySelector<HTMLElement>('.dock-side-panel')!;
		const layersIcon = document.querySelector<HTMLButtonElement>(`[data-dock-panel="${ToolbarId.Layers}"]`)!;
		layersIcon.click();
		expect(sidePanel.hidden).toBe(false);
		expect(docked.openPanel).toBe(ToolbarId.Layers);
		expect(layersIcon.getAttribute('aria-pressed')).toBe('true');
		expect(document.querySelector('.dock-panel-title')?.textContent).toBe('Layers & Objects');
		expect(storage.getItem(OPEN_PANEL_KEY)).toBe(ToolbarId.Layers);
		layersIcon.click();
		expect(sidePanel.hidden).toBe(true);
		expect(storage.getItem(OPEN_PANEL_KEY)).toBeNull();
		docked.show(ToolbarId.Effects);
		document.querySelector<HTMLButtonElement>('.dock-panel-close')!.click();
		expect(docked.openPanel).toBeNull();
		docked.show('missing');
		expect(sidePanel.hidden).toBe(true);
	});

	it('reopens the toolbar that was open last time', () => {
		new DockedWorkspace(parts, memoryStorage({ [OPEN_PANEL_KEY]: ToolbarId.Effects }));
		expect(document.querySelector(`[data-panel="${ToolbarId.Effects}"]`)?.classList).toContain('dock-active');
		expect(document.querySelector<HTMLElement>('.dock-side-panel')!.hidden).toBe(false);
	});
});
