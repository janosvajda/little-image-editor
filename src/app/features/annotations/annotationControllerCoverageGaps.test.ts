import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { TOOLBAR_AUTO_OPEN_EVENT, TOOLBAR_VISIBILITY_EVENT } from '../workspace/managedToolbarPanel';
import { AnnotationController } from './annotationController';
import { AnnotationObjectTypeId, AnnotationToolId } from './annotationTypes';

describe('AnnotationController uncovered behavior', () => {
	let model: CanvasDocument;
	let controller: AnnotationController;

	beforeEach(() => {
		vi.restoreAllMocks();
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation(((name: string, options?: ElementCreationOptions) => {
			const created = createElement(name, options);
			if (created instanceof HTMLCanvasElement) addCanvasMethods(created.getContext('2d')!);
			return created;
		}) as typeof document.createElement);
		model = new CanvasDocument(document.querySelector('#canvas')!, document.querySelector('#overlay')!);
		model.create({ name: 'coverage', width: 200, height: 100, transparent: false, background: '#fff' });
		model.overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: vi.fn() });
		controller = new AnnotationController(model, { addCanvasLayer: (layer: HTMLCanvasElement) => model.overlay.before(layer) } as never);
		addCanvasMethods(controller.canvas.getContext('2d')!);
		addCanvasMethods(model.context);
	});

	it('shares activation, visibility, focus-preset, and history lifecycle events', () => {
		const interaction = vi.fn();
		const history = vi.fn();
		controller.onInteractionRequested(interaction);
		controller.onHistoryChange(history);
		controller.panel.element.dispatchEvent(new CustomEvent(TOOLBAR_AUTO_OPEN_EVENT));
		expect(interaction).toHaveBeenCalledOnce();
		expect(document.body.classList).toContain('annotation-focus-preset');

		controller.annotations.add({ id: 'step', type: AnnotationObjectTypeId.Step, at: { x: 30, y: 30 }, value: 1, color: '#f00', size: 12 });
		controller.undo();
		controller.redo();
		expect(history).toHaveBeenCalled();
		controller.suspendInteractions();
		expect(controller.active).toBe(false);
		controller.syncPanelVisibility(true);
		expect(controller.active).toBe(true);
		controller.panel.element.dispatchEvent(new CustomEvent(TOOLBAR_VISIBILITY_EVENT, { detail: { visible: false } }));
		expect(controller.active).toBe(false);
		controller.activate(true);
		document.querySelector('[data-panel="tools"]')!.dispatchEvent(new CustomEvent(TOOLBAR_VISIBILITY_EVENT, { bubbles: true, detail: { visible: true } }));
		expect(document.body.classList).not.toContain('annotation-focus-preset');
	});

	it('supports marker editing, report ownership, and clearing', () => {
		controller.activate();
		Object.defineProperty(controller.panel.markerValue, 'value', { configurable: true, writable: true, value: 'NaN' });
		controller.panel.markerValue.dispatchEvent(new Event('change'));
		expect(controller.annotations.state.nextStep).toBe(1);
		controller.panel.markerValue.value = '7';
		controller.panel.markerValue.dispatchEvent(new Event('change'));
		expect(controller.annotations.state.nextStep).toBe(7);
		controller.panel.restart.click();
		expect(controller.annotations.state.nextStep).toBe(1);
		controller.panel.reportPreview.value = 'Manual report';
		controller.panel.reportPreview.dispatchEvent(new Event('input'));
		controller.panel.clear.click();
		expect(controller.annotations.state.objects).toHaveLength(0);
	});

	it('creates, edits, previews, cancels, and commits inline text at its canvas position', () => {
		controller.activate();
		controller.panel.toolButtons.get(AnnotationToolId.Text)!.click();
		pointer('pointerdown', 50, 40);
		let editor = document.querySelector<HTMLInputElement>('.annotation-inline-text')!;
		expect(editor).not.toBeNull();
		editor.value = 'Created inline';
		editor.dispatchEvent(new Event('input'));
		editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(controller.annotations.state.objects[0]).toEqual(expect.objectContaining({ text: 'Created inline' }));

		pointer('dblclick', 50, 40);
		editor = document.querySelector<HTMLInputElement>('.annotation-inline-text')!;
		editor.value = 'Temporary edit';
		editor.dispatchEvent(new Event('input'));
		editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(controller.annotations.state.objects[0]).toEqual(expect.objectContaining({ text: 'Created inline' }));
		pointer('dblclick', 50, 40);
		editor = document.querySelector<HTMLInputElement>('.annotation-inline-text')!;
		editor.value = 'Committed edit';
		editor.dispatchEvent(new Event('input'));
		editor.dispatchEvent(new Event('blur'));
		expect(controller.annotations.state.objects[0]).toEqual(expect.objectContaining({ text: 'Committed edit' }));
	});

	it('handles all keyboard tools while ignoring editor fields and application history shortcuts', () => {
		controller.activate();
		const shortcuts = ['v', 'a', 'b', 'h', 't', 'u', 'r', 'c'];
		for (const shortcut of shortcuts) document.dispatchEvent(new KeyboardEvent('keydown', { key: shortcut, bubbles: true, cancelable: true }));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
		const input = document.createElement('input');
		document.body.append(input);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		controller.suspendInteractions();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
		expect(model.overlay.style.cursor).toBeTruthy();
	});

	it('selects empty space and distinguishes a click on an existing object from a drag', () => {
		controller.activate();
		controller.annotations.add({ id: 'step', type: AnnotationObjectTypeId.Step, at: { x: 60, y: 40 }, value: 1, color: '#f00', size: 16 });
		controller.panel.toolButtons.get(AnnotationToolId.Select)!.click();
		pointer('pointerdown', 10, 10);
		pointer('pointerup', 10, 10);
		expect(controller.annotations.selected).toBeNull();
		controller.panel.toolButtons.get(AnnotationToolId.Box)!.click();
		pointer('pointerdown', 60, 40);
		pointer('pointermove', 61, 40);
		pointer('pointerup', 61, 40);
		expect(controller.annotations.selectedId).toBe('step');
	});

	function pointer(type: string, x: number, y: number): void {
		model.overlay.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
	}
});

function addCanvasMethods(context: CanvasRenderingContext2D): void {
	for (const method of ['arc', 'fillText', 'strokeRect', 'clip'] as const) {
		if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
	}
}
