import { beforeEach, describe, expect, it } from 'vitest';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { textFrame } from '../../core/geometry/textShapeMetrics';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type TextAnnotation } from '../annotations/annotationTypes';
import { MarkupActions } from './markupActions';

const Surface = { width: 240, height: 180 } as const;
const Click = { clientX: 320, clientY: 250 } as const;
const Position = { x: 80, y: 100 } as const;
const Style = { color: ColorPalette.Red, size: 10, opacity: 1, hardness: 1 } as const;
const InlineText = '.annotation-inline-text';

let objects: AnnotationDocument;
let markup: MarkupActions;

beforeEach(() => {
	const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
	const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
	const model = new CanvasDocument(canvas, overlay);
	model.create({ name: 'text-position', ...Surface, transparent: false, background: ColorPalette.White });
	overlay.getBoundingClientRect = () => new DOMRect(0, 0, Surface.width, Surface.height);
	objects = new AnnotationDocument();
	markup = new MarkupActions(model, objects);
});

describe('text positioning from browser events', () => {
	it('opens at pointer event coordinates and commits into the active layer', () => {
		const layerId = objects.createLayer();
		markup.createText(Position, new MouseEvent('pointerdown', Click), Style);
		const input = positionedInput();
		input.value = 'Canvas label';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		const item = objects.state.objects[0]!;
		expect(item).toMatchObject({ type: AnnotationObjectTypeId.Text, at: Position, text: 'Canvas label', color: Style.color });
		expect(objects.layerOf(item.id)?.id).toBe(layerId);
		objects.undo();
		expect(objects.state.objects).toHaveLength(0);
	});

	it('opens editing at double-click event coordinates and restores cancelled text', () => {
		const item: TextAnnotation = { id: 'label', type: AnnotationObjectTypeId.Text, at: Position, text: 'Original label', size: 20, color: Style.color, rect: textFrame(Position, 'Original label', 20) };
		objects.add(item);
		markup.editText(item, new MouseEvent('dblclick', Click));
		const input = positionedInput();
		input.value = 'Preview';
		input.dispatchEvent(new Event('input'));
		expect(objects.object(item.id)).toMatchObject({ text: 'Preview' });
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(objects.object(item.id)).toEqual(item);
		expect(input.isConnected).toBe(false);
	});
});

function positionedInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>(InlineText)!;
	expect(document.activeElement).toBe(input);
	expect(input.style.left).toBe(`${Click.clientX}px`);
	expect(input.style.top).toBe(`${Click.clientY}px`);
	return input;
}
