import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PaintToolId, UtilityToolId } from '../../core/document/appTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { DrawingController } from './drawingController';

describe('DrawingController uncovered behavior', () => {
	let model: CanvasDocument;
	let drawing: DrawingController;
	let editableObjects: AnnotationDocument;
	const viewport = {
		zoomIn: vi.fn(),
		zoomOut: vi.fn(),
		fitToWindow: vi.fn(),
		actualPixels: vi.fn(),
		zoomAt: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		model = new CanvasDocument(document.querySelector('#canvas')!, document.querySelector('#overlay')!);
		model.create({ name: 'drawing-coverage', width: 200, height: 100, transparent: false, background: '#fff' });
		model.overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: vi.fn() });
		editableObjects = new AnnotationDocument();
		drawing = new DrawingController(model, viewport as never, editableObjects);
	});

	it('routes every view action and reports shortcut activation accurately', () => {
		const actions = [
			['Zoom out', viewport.zoomOut],
			['Zoom in', viewport.zoomIn],
			['Fit image to window', viewport.fitToWindow],
			['Actual pixels', viewport.actualPixels],
		] as const;
		for (const [title, action] of actions) {
			document.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!.click();
			expect(action).toHaveBeenCalledOnce();
		}
		expect(drawing.selectFromShortcut('?')).toBe(false);
		expect(drawing.selectFromShortcut('p')).toBe(true);
		expect(document.querySelector('#paintToolControl')!.classList).toContain('active');
	});

	it('reclaims interaction ownership, handles coalesced paint samples, and restores cursors', () => {
		const requested = vi.fn();
		drawing.onInteractionRequested(requested);
		drawing.suspendInteractions();
		drawing.select(PaintToolId.Brush);
		expect(requested).toHaveBeenCalledOnce();

		pointer('pointerdown', 20, 20);
		const move = pointerEvent('pointermove', 60, 50);
		Object.defineProperty(move, 'getCoalescedEvents', {
			value: () => [pointerEvent('pointermove', 35, 30), pointerEvent('pointermove', 60, 50)],
		});
		model.overlay.dispatchEvent(move);
		model.overlay.dispatchEvent(pointerEvent('pointercancel', 60, 50));
		expect(editableObjects.selected).toMatchObject({
			type: 'stroke',
			tool: PaintToolId.Brush,
		});
		expect(model.context.lineTo).not.toHaveBeenCalled();
		model.overlay.dispatchEvent(pointerEvent('pointerleave', 80, 70));
		expect(model.overlay.style.cursor).toBe('crosshair');
	});

	it('supports zoom modifier cursors and cancellation of a pending crop', () => {
		drawing.select(UtilityToolId.Zoom);
		model.overlay.dispatchEvent(pointerEvent('pointerenter', 40, 30, true));
		expect(model.overlay.style.cursor).toBe('zoom-out');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
		document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
		window.dispatchEvent(new Event('blur'));
		pointer('pointerdown', 40, 30, true);
		expect(viewport.zoomAt).toHaveBeenCalled();

		drawing.select(UtilityToolId.Crop);
		pointer('pointerdown', 10, 10);
		pointer('pointerup', 80, 60);
		expect(document.querySelector<HTMLButtonElement>('#applyCropButton')!.classList).not.toContain('hidden');
		document.querySelector<HTMLButtonElement>('[data-cancel-crop]')!.click();
		expect(document.querySelector<HTMLButtonElement>('#applyCropButton')!.classList).toContain('hidden');
	});

	it('clears shape selection when Select clicks empty canvas', () => {
		drawing.select(UtilityToolId.Select);
		pointer('pointerdown', 150, 80);
		pointer('pointerup', 150, 80);
		expect(model.overlay.style.cursor).toBe('default');
	});

	function pointer(type: string, x: number, y: number, altKey = false): void {
		model.overlay.dispatchEvent(pointerEvent(type, x, y, altKey));
	}
});

function pointerEvent(type: string, x: number, y: number, altKey = false): PointerEvent {
	return new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y, altKey });
}
