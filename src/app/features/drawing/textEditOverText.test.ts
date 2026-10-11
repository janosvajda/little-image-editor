import { describe, expect, it } from 'vitest';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { textFrame } from '../../core/geometry/textShapeMetrics';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type TextAnnotation } from '../annotations/annotationTypes';
import { MarkupActions } from './markupActions';

const Surface = { width: 240, height: 180 } as const;
/** The canvas on screen: moved by scrolling and shown at 200%. */
const Shown = { left: 30, top: 50, scale: 2 } as const;

describe('editing a text on a zoomed and scrolled canvas', () => {
	it('opens the edit box over the text, at its zoomed size, wherever the double-click hit it', () => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'zoomed', ...Surface, transparent: false, background: ColorPalette.White });
		model.overlay.getBoundingClientRect = () => new DOMRect(Shown.left, Shown.top, Surface.width * Shown.scale, Surface.height * Shown.scale);
		const objects = new AnnotationDocument();
		const markup = new MarkupActions(model, objects);
		const at = { x: 40, y: 70 };
		const item: TextAnnotation = { id: 'label', type: AnnotationObjectTypeId.Text, at, text: 'browserPlatform / vscodePlatform', size: 16, color: ColorPalette.Black, rect: textFrame(at, 'browserPlatform / vscodePlatform', 16) };
		objects.add(item);
		// Double-clicked near the end of the text.
		markup.editText(item, new MouseEvent('dblclick', { clientX: 400, clientY: 190 }));
		const input = document.querySelector<HTMLInputElement>('.annotation-inline-text')!;
		expect(input.style.left).toBe(`${Shown.left + at.x * Shown.scale}px`);
		expect(input.style.top).toBe(`${Shown.top + at.y * Shown.scale}px`);
		expect(input.style.font).toContain(`${item.size * Shown.scale}px`);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	});
});
