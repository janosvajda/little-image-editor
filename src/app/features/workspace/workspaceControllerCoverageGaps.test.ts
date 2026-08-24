import { describe, expect, it, vi } from 'vitest';
import { AnnotationPanel } from '../annotations/annotationPanel';
import { TOOLBAR_AUTO_OPEN_EVENT } from './managedToolbarPanel';
import { WorkspaceUi } from './workspaceController';

const nextFrame = (): Promise<DOMHighResTimeStamp> => new Promise(requestAnimationFrame);

describe('WorkspaceUi uncovered behavior', () => {
	it('manages generic panel presets, auto-open metadata, and invalid visibility requests', async () => {
		const annotationPanel = new AnnotationPanel();
		document.querySelector('[data-panel="transform"]')!.before(annotationPanel.element);
		const ui = new WorkspaceUi([]);
		const tools = document.querySelector<HTMLElement>('[data-panel="tools"]')!;
		const annotations = document.querySelector<HTMLElement>('[data-panel="annotations"]')!;

		ui.setPanelVisible('missing-toolbar', true);
		ui.setPanelVisible('tools', true);
		ui.beginPanelPreset(['tools']);
		ui.beginPanelPreset(['annotations']);
		expect(annotations.hidden).toBe(false);
		ui.endPanelPreset();
		expect(tools.hidden).toBe(false);
		ui.endPanelPreset();
		ui.commitPanelPreset();

		expect(ui.autoOpenToolbar('unknown-mode')).toBe(false);
		const opened = vi.fn();
		annotations.addEventListener(TOOLBAR_AUTO_OPEN_EVENT, opened);
		expect(ui.autoOpenToolbar('annotate')).toBe(true);
		expect(opened).toHaveBeenCalledOnce();
		ui.setPanelVisible('annotations', false);
		await nextFrame();
		expect(annotations.hidden).toBe(true);
	});

	it('resolves explicit and operating-system themes and reacts to preference changes', () => {
		const listeners = new Map<string, () => void>();
		const matches = new Map([
			['(prefers-color-scheme: light)', false],
			['(prefers-contrast: more)', true],
			['(forced-colors: active)', false],
		]);
		vi.mocked(matchMedia).mockImplementation((query) => ({
			matches: matches.get(query) ?? false,
			media: query,
			onchange: null,
			addEventListener: (_type, listener) => listeners.set(query, listener as () => void),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));
		const ui = new WorkspaceUi([]);
		expect(ui.resolvedTheme).toBe('contrast');
		ui.themeSelect.value = 'dark';
		ui.themeSelect.dispatchEvent(new Event('change'));
		expect(document.documentElement.dataset.theme).toBe('dark');
		listeners.get('(prefers-color-scheme: light)')?.();
		expect(document.documentElement.dataset.theme).toBe('dark');
		ui.themeSelect.value = 'auto';
		matches.set('(prefers-contrast: more)', false);
		matches.set('(prefers-color-scheme: light)', true);
		listeners.get('(prefers-color-scheme: light)')?.();
		expect(ui.resolvedTheme).toBe('light');
	});

	it('covers complete menubar navigation, dismissal, and fullscreen event controls', async () => {
		const dialog = document.querySelector<HTMLDialogElement>('#newImageDialog')!;
		dialog.showModal();
		const ui = new WorkspaceUi([dialog]);
		const file = document.querySelector<HTMLDetailsElement>('#fileMenu')!;
		const edit = document.querySelector<HTMLDetailsElement>('#editMenu')!;
		const fileSummary = file.querySelector<HTMLElement>('summary')!;
		const editSummary = edit.querySelector<HTMLElement>('summary')!;
		const key = (target: HTMLElement, value: string): void => {
			target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
		};

		fileSummary.focus();
		key(fileSummary, 'ArrowRight');
		expect(document.activeElement).toBe(editSummary);
		key(editSummary, 'ArrowLeft');
		expect(document.activeElement).toBe(fileSummary);
		key(fileSummary, 'ArrowUp');
		expect(file.open).toBe(true);
		key(document.activeElement as HTMLElement, 'ArrowDown');
		key(document.activeElement as HTMLElement, 'ArrowUp');
		key(fileSummary, 'Enter');
		expect(file.open).toBe(false);
		key(fileSummary, ' ');
		expect(file.open).toBe(true);
		key(fileSummary, 'Escape');
		expect(file.open).toBe(false);
		key(fileSummary, 'End');
		expect(document.activeElement).toBe(ui.menus.at(-1)!.querySelector('summary'));
		key(ui.menus.at(-1)!.querySelector('summary')!, 'Home');
		expect(document.activeElement).toBe(fileSummary);
		file.open = true;
		document.body.click();
		expect(file.open).toBe(false);

		document.querySelector<HTMLButtonElement>('#focusButton')!.click();
		await vi.waitFor(() => expect(document.body.classList).toContain('focus-mode'));
		expect(dialog.open).toBe(false);
		document.dispatchEvent(new Event('fullscreenchange'));
		expect(document.body.classList).not.toContain('focus-mode');
		window.dispatchEvent(new Event('resize'));
		document.querySelector<HTMLButtonElement>('#menuFocusButton')!.click();
		await vi.waitFor(() => expect(document.body.classList).toContain('focus-mode'));
		document.querySelector<HTMLButtonElement>('#exitFocusButton')!.click();
		await vi.waitFor(() => expect(document.body.classList).not.toContain('focus-mode'));
	});

	it('exits the browser fullscreen API and preserves a positioned panel when revealing it', async () => {
		const ui = new WorkspaceUi([]);
		const adjust = document.querySelector<HTMLElement>('[data-panel="adjust"]')!;
		adjust.style.left = '80px';
		adjust.style.top = '90px';
		Object.defineProperty(adjust, 'offsetLeft', { configurable: true, value: 80 });
		Object.defineProperty(adjust, 'offsetTop', { configurable: true, value: 90 });
		Object.defineProperty(adjust, 'offsetParent', { configurable: true, value: ui.workspace });
		ui.setPanelVisible('adjust', true);
		await nextFrame();
		expect(adjust.style.left).toBe('80px');

		Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
		await ui.toggleFocus(false);
		expect(document.exitFullscreen).toHaveBeenCalledOnce();
	});

	it('restores an auto-open preset when its panel is dismissed', () => {
		const annotationPanel = new AnnotationPanel();
		document.querySelector('[data-panel="transform"]')!.before(annotationPanel.element);
		const ui = new WorkspaceUi([]);
		ui.beginPanelPreset(['annotations']);
		ui.setPanelVisible('annotations', false);
		expect(document.querySelector<HTMLElement>('[data-panel="tools"]')!.hidden).toBe(false);
		expect(annotationPanel.element.hidden).toBe(true);
	});

	it('searches every dock column before using the bounded fallback position', async () => {
		const workspace = document.querySelector<HTMLElement>('.workspace')!;
		Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 300 });
		Object.defineProperty(workspace, 'clientHeight', { configurable: true, value: 200 });
		const ui = new WorkspaceUi([]);
		const target = document.querySelector<HTMLElement>('[data-panel="transform"]')!;
		let obstacleIndex = 0;
		for (const panel of ui.panels) {
			Object.defineProperty(panel, 'offsetParent', { configurable: true, value: workspace });
			Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: panel === target ? 100 : 3_000 });
			Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 50 });
			Object.defineProperty(panel, 'offsetLeft', { configurable: true, value: panel === target ? 0 : -1_000 });
			Object.defineProperty(panel, 'offsetTop', { configurable: true, value: panel === target ? 0 : 14 + obstacleIndex++ * 64 });
			panel.hidden = panel === target;
			panel.style.left = '';
			panel.style.top = '';
		}
		ui.setPanelVisible('transform', true);
		await nextFrame();
		expect(target.style.top).toBe('14px');
	});
});
