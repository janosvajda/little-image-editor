import { beforeEach, describe, expect, it } from 'vitest';
import {
	MarkupToolId,
	ShapeToolId,
	UtilityToolId,
} from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type TextAnnotation,
} from '../annotations/annotationTypes';
import { DRAWING_TOOL_DOCUMENT_CONTRACT } from '../projects/editorToolContract';
import { DrawingController } from './drawingController';
import { toolForShortcut } from './drawingToolCatalog';

type TestPoint = Readonly<{ x: number; y: number }>;

const Surface = { width: 240, height: 160 } as const;
const INLINE_TEXT = '.annotation-inline-text';
const HIGHLIGHT_OPACITY = 0.35;

let model: CanvasDocument;
let objects: AnnotationDocument;
let drawing: DrawingController;
let overlay: HTMLCanvasElement;

beforeEach(() => {
	const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
	overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
	model = new CanvasDocument(canvas, overlay);
	model.create({ name: 'markup', ...Surface, transparent: false, background: '#ffffff' });
	overlay.getBoundingClientRect = () =>
		({ left: 0, top: 0, right: Surface.width, bottom: Surface.height, x: 0, y: 0, ...Surface }) as DOMRect;
	objects = new AnnotationDocument();
	drawing = new DrawingController(model, undefined, objects);
});

describe('markup tools are ordinary shared tools', () => {
	it('are listed with shortcuts and registered for layers and .limg', () => {
		for (const tool of Object.values(MarkupToolId)) {
			expect(DRAWING_TOOL_DOCUMENT_CONTRACT[tool]).toBeDefined();
		}
		expect(toolForShortcut('n')).toBe(MarkupToolId.Number);
		expect(toolForShortcut('g')).toBe(MarkupToolId.Highlight);
		expect(toolForShortcut('t')).toBe(MarkupToolId.Text);
		expect(toolForShortcut('u')).toBe(MarkupToolId.Blur);
		expect(toolForShortcut('x')).toBe(MarkupToolId.Redact);
	});

	it('drag out highlight, blur and redaction areas in the active layer', () => {
		for (const tool of [MarkupToolId.Highlight, MarkupToolId.Blur, MarkupToolId.Redact]) {
			drawing.select(tool);
			drag({ x: 20, y: 20 }, { x: 80, y: 60 });
		}
		expect(objects.state.objects.map((item) => item.type)).toEqual([
			AnnotationObjectTypeId.Highlight,
			AnnotationObjectTypeId.Blur,
			AnnotationObjectTypeId.Redact,
		]);
		expect(objects.state.layers).toHaveLength(1);
		expect(objects.state.objects[0]).toMatchObject({ rect: { x: 20, y: 20, width: 60, height: 40 } });
	});

	it('ignores a click without a drag for an area tool, as one undo step each otherwise', () => {
		drawing.select(MarkupToolId.Redact);
		drag({ x: 30, y: 30 }, { x: 30, y: 30 });
		expect(objects.state.objects).toHaveLength(0);
		drag({ x: 30, y: 30 }, { x: 60, y: 60 });
		expect(objects.state.objects).toHaveLength(1);
		objects.undo();
		expect(objects.state.objects).toHaveLength(0);
	});

	it('places numbered markers that count up', () => {
		drawing.select(MarkupToolId.Number);
		click({ x: 20, y: 20 });
		click({ x: 60, y: 20 });
		expect(objects.state.objects.map((item) => (item.type === AnnotationObjectTypeId.Step ? item.value : null))).toEqual([1, 2]);
		expect(objects.state.nextStep).toBe(3);
	});

	it('writes text in place, and edits it again on a double-click', () => {
		drawing.select(MarkupToolId.Text);
		click({ x: 40, y: 50 });
		typeInline('Hello');
		const text = objects.state.objects[0] as TextAnnotation;
		expect(text).toMatchObject({ type: AnnotationObjectTypeId.Text, text: 'Hello', at: { x: 40, y: 50 } });

		drawing.select(UtilityToolId.Select);
		const frame = text.rect!;
		overlay.dispatchEvent(
			new MouseEvent('dblclick', {
				bubbles: true,
				clientX: frame.x + frame.width / 2,
				clientY: frame.y + frame.height / 2,
			}),
		);
		typeInline('Hello again');
		expect((objects.object(text.id) as TextAnnotation).text).toBe('Hello again');
	});

	it('starts Highlight half see-through while other tools keep their own opacity', () => {
		const opacity = document.querySelector<HTMLInputElement>('#opacityInput')!;
		drawing.select(ShapeToolId.Rectangle);
		const shapeOpacity = opacity.value;
		drawing.select(MarkupToolId.Highlight);
		expect(Number(opacity.value) / 100).toBe(HIGHLIGHT_OPACITY);
		drawing.select(ShapeToolId.Rectangle);
		expect(opacity.value).toBe(shapeOpacity);
	});
});

function typeInline(value: string): void {
	const input = document.querySelector<HTMLInputElement>(INLINE_TEXT)!;
	input.value = value;
	input.dispatchEvent(new Event('input'));
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

function click(point: TestPoint): void {
	drag(point, point);
}

function drag(from: TestPoint, to: TestPoint): void {
	for (const [type, point] of [
		['pointerdown', from],
		['pointermove', to],
		['pointerup', to],
	] as const)
		overlay.dispatchEvent(
			new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y }),
		);
}
