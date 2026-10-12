import { describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { EditableObjectPropertyId, editableObjectProperties, setEditableObjectProperty } from '../annotations/editableObjectProperties';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { parseDrawScript } from '../assistant/drawScript';
import { framedShape } from '../diagrams/diagramShapes';
import { ColorPickerGuard } from './colorPickerGuard';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';

const BOX: ShapeAnnotation = {
	id: 'box',
	type: AnnotationObjectTypeId.Shape,
	shape: ShapeToolId.Rectangle,
	rect: { x: 10, y: 10, width: 80, height: 40 },
	color: '#333333',
	width: 2,
	opacity: 1,
	fill: true,
	fillColor: '#ffeeaa',
};

function documentWith(object: ShapeAnnotation | Record<string, unknown>): AnnotationDocument {
	const objects = new AnnotationDocument();
	objects.add(structuredClone(object) as ShapeAnnotation);
	return objects;
}

function change(input: HTMLInputElement, value: string | boolean): void {
	if (typeof value === 'boolean') input.checked = value;
	else input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('a shape with its own fill colour', () => {
	it('is filled with its fill colour and outlined in its colour; a shape filled before fill colours is not outlined', () => {
		const context = document.querySelector<HTMLCanvasElement>('#overlay')!.getContext('2d')!;
		const drawn: string[] = [];
		Object.assign(context, {
			fill: vi.fn(() => drawn.push(`fill ${String(context.fillStyle)}`)),
			stroke: vi.fn(() => drawn.push(`stroke ${String(context.strokeStyle)}`)),
		});
		renderAnnotationObject(context, document.createElement('canvas'), BOX);
		expect(drawn).toEqual(['fill #ffeeaa', 'stroke #333333']);
		drawn.length = 0;
		const { fillColor: _, ...legacy } = BOX;
		renderAnnotationObject(context, document.createElement('canvas'), legacy);
		expect(drawn).toEqual(['fill #333333']);
	});

	it('offers its fill colour only while filled, which is its colour until it has its own', () => {
		expect(editableObjectProperties(BOX)).toMatchObject({ color: '#333333', fill: true, fillColor: '#ffeeaa' });
		expect(editableObjectProperties({ ...BOX, fillColor: undefined })).toMatchObject({ fillColor: '#333333' });
		expect(editableObjectProperties({ ...BOX, fill: false })).not.toHaveProperty('fillColor');
		const box = structuredClone(BOX);
		setEditableObjectProperty(box, EditableObjectPropertyId.FillColor, '#00ff00');
		expect(box.fillColor).toBe('#00ff00');
	});

	it('is drawn by commands, scripts and diagrams as one item', () => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'boxes', width: 200, height: 200, transparent: false, background: '#ffffff' });
		const objects = new AnnotationDocument();
		const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
		const [scripted] = parseDrawScript('rect 10,10 80x40 #333333 outline 2 fill #ffeeaa').commands;
		expect(scripted).toMatchObject({ fill: true, fillColor: '#ffeeaa', strokeWidth: 2, color: '#333333' });
		runner.run(scripted!);
		runner.run({ ...scripted!, fill: false } as typeof scripted & object);
		expect(objects.state.objects[0]).toMatchObject({ fill: true, fillColor: '#ffeeaa' });
		// An outlined shape has no fill to colour.
		expect(objects.state.objects[1]).not.toHaveProperty('fillColor');
		const diagramBox = framedShape(ShapeToolId.Rectangle, BOX.rect, '#ffeeaa', '#333333', 2);
		expect(diagramBox).toEqual([expect.objectContaining({ kind: AssistantCommandKind.AddShape, color: '#333333', fill: true, fillColor: '#ffeeaa', strokeWidth: 2 })]);
	});
});

describe('the selected object controls', () => {
	const controls = (object: Record<string, unknown>) => {
		document.body.innerHTML = '<div id="properties"></div>';
		const objects = documentWith(object);
		const parent = document.querySelector<HTMLElement>('#properties')!;
		new SelectedObjectPropertiesController(objects, parent);
		const row = (property: string) => parent.querySelector<HTMLElement>(`[data-object-property="${property}"]`)!;
		return { objects, parent, row };
	};

	it('show the controls without a title, a shape\'s colour as its line beside its fill', () => {
		const { parent, row } = controls(BOX);
		expect(parent.querySelector('.selected-object-options')!.textContent).not.toContain('Selected object');
		expect(row(EditableObjectPropertyId.Color).textContent).toBe('Line');
		expect(row(EditableObjectPropertyId.Fill).textContent).toBe('Fill');
		expect(row(EditableObjectPropertyId.FillColor).classList).not.toContain('hidden');
		expect(parent.querySelector<HTMLInputElement>('[aria-label="Selected object fill colour"]')!.value).toBe('#ffeeaa');
	});

	it('change the fill colour, and keep showing it when the shape stops being filled', () => {
		const { objects, parent, row } = controls(BOX);
		change(parent.querySelector<HTMLInputElement>('[aria-label="Selected object fill colour"]')!, '#00aa00');
		expect(objects.selected).toMatchObject({ fillColor: '#00aa00', color: '#333333' });
		parent.querySelector<HTMLButtonElement>('[aria-label="Selected object style"] [data-shape-style="outline"]')!.click();
		expect(objects.selected).toMatchObject({ fill: false });
		expect(row(EditableObjectPropertyId.FillColor).classList).not.toContain('hidden');
	});

	it('call the colour of anything that is not a shape its colour', () => {
		const { row } = controls({ id: 'words', type: AnnotationObjectTypeId.Text, at: { x: 1, y: 20 }, text: 'Hi', color: '#000000', size: 16 });
		expect(row(EditableObjectPropertyId.Color).textContent).toBe('Color');
		expect(row(EditableObjectPropertyId.FillColor).classList).toContain('hidden');
	});
});

describe('closing a colour picker', () => {
	it('takes only the press that closes a picker opened with a click, so the selection stays', () => {
		document.body.innerHTML = '<input id="colour" type="color"><button id="other">x</button>';
		const guard = new ColorPickerGuard();
		const colour = document.querySelector<HTMLInputElement>('#colour')!;
		expect(guard.closesPicker()).toBe(false);
		colour.focus();
		colour.click();
		expect(guard.closesPicker()).toBe(true);
		expect(document.activeElement).not.toBe(colour);
		// Only the first press closes it; the next one is the canvas's again.
		expect(guard.closesPicker()).toBe(false);
		colour.focus();
		colour.click();
		document.querySelector<HTMLButtonElement>('#other')!.click();
		expect(guard.closesPicker()).toBe(false);
	});

	it('does not take a press when the picker\'s input already lost the focus', () => {
		document.body.innerHTML = '<input id="colour" type="color">';
		const guard = new ColorPickerGuard();
		const colour = document.querySelector<HTMLInputElement>('#colour')!;
		colour.click();
		colour.blur();
		expect(guard.closesPicker()).toBe(false);
	});
});
