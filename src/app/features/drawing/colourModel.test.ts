import { describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { applyShapeStyle, DEFAULT_OUTLINE_WIDTH, isShapeStyle, ShapeStyle, shapeStyleOf, styledFields } from '../annotations/shapeStyle';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';
import { ShapeStyleButtons } from './shapeStyleButtons';
import { DEFAULT_TOOL_COLORS, ToolColorsControl, ToolColorTarget } from './toolColorsControl';

const BOX: ShapeAnnotation = { id: 'box', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x: 0, y: 0, width: 10, height: 10 }, color: '#0000ff', width: 4, opacity: 1, fill: false };

function colourInput(value: string): HTMLInputElement {
	const input = document.createElement('input');
	input.type = 'color';
	input.value = value;
	return input;
}

describe('shape styles', () => {
	it('are read from what a shape draws, and give new shapes their fields', () => {
		expect(shapeStyleOf({ fill: false, width: 3 })).toBe(ShapeStyle.Outline);
		expect(shapeStyleOf({ fill: true, width: 0 })).toBe(ShapeStyle.Fill);
		expect(shapeStyleOf({ fill: true, width: 3 })).toBe(ShapeStyle.OutlineAndFill);
		expect(styledFields(ShapeStyle.Outline, 3, '#ff0000')).toEqual({ fill: false, width: 3 });
		expect(styledFields(ShapeStyle.Fill, 3, '#ff0000')).toEqual({ fill: true, fillColor: '#ff0000', width: 0 });
		expect(styledFields(ShapeStyle.OutlineAndFill, 3, '#ff0000')).toEqual({ fill: true, fillColor: '#ff0000', width: 3 });
		expect([isShapeStyle(ShapeStyle.Fill), isShapeStyle('dotted')]).toEqual([true, false]);
	});

	it('change a shape, a new fill starting from the fill colour and an outline coming back where there was none', () => {
		const item = structuredClone(BOX);
		applyShapeStyle(item, ShapeStyle.Fill, '#ff0000');
		expect(item).toMatchObject({ fill: true, fillColor: '#ff0000', width: 0 });
		applyShapeStyle(item, ShapeStyle.OutlineAndFill, '#00ff00');
		expect(item).toMatchObject({ fill: true, fillColor: '#ff0000', width: DEFAULT_OUTLINE_WIDTH });
		applyShapeStyle(item, ShapeStyle.Outline, '#00ff00');
		expect(item).toMatchObject({ fill: false, width: DEFAULT_OUTLINE_WIDTH });
	});
});

describe('the colours control', () => {
	it('sets, swaps and resets the tools\' two colours, and a second swap always swaps them back', () => {
		document.body.innerHTML = '<label>Color <input id="line" type="color" value="#123456"></label>';
		const changed = vi.fn();
		const control = new ToolColorsControl(document.querySelector('#line')!, colourInput('#abcdef'), changed);
		document.body.append(control.element);
		expect(document.body.textContent).not.toContain('Color');
		expect(control.element.classList).toContain('tool-option-persistent');
		control.set(ToolColorTarget.Fill, '#ff0000');
		control.swap();
		expect([control.lineColor, control.fillColor]).toEqual(['#ff0000', '#123456']);
		control.element.querySelector<HTMLButtonElement>('[aria-label^="Swap"]')!.click();
		expect([control.lineColor, control.fillColor]).toEqual(['#123456', '#ff0000']);
		control.element.querySelector<HTMLButtonElement>('[aria-label^="Reset"]')!.click();
		expect([control.lineColor, control.fillColor]).toEqual([DEFAULT_TOOL_COLORS.line, DEFAULT_TOOL_COLORS.fill]);
		// Each set, swap and reset is remembered once.
		expect(changed).toHaveBeenCalledTimes(4);
	});
});

describe('the selected object section', () => {
	const section = (item: ShapeAnnotation) => {
		document.body.innerHTML = '<div id="properties"></div>';
		const objects = new AnnotationDocument();
		objects.add(structuredClone(item));
		objects.select(item.id);
		new SelectedObjectPropertiesController(objects, document.querySelector('#properties')!, undefined, undefined, { fillColor: () => '#ff0000', chooseShapeStyle: vi.fn() });
		const fill = document.querySelector<HTMLInputElement>('[aria-label="Selected object fill colour"]')!;
		return { objects, fill, fillRow: document.querySelector<HTMLElement>('[data-object-property="fillColor"]')! };
	};

	it('is titled with what is selected, and an outlined shape shows No fill, which a chosen colour fills', () => {
		const { objects, fill, fillRow } = section(BOX);
		expect(document.querySelector('.selected-object-title')!.textContent).toBe('Rectangle');
		expect(document.querySelector<HTMLElement>('.fill-group')!.classList).not.toContain('hidden');
		expect(fillRow.classList).toContain('no-fill');
		expect(fill.title).toContain('No fill');
		fill.value = '#00ff00';
		fill.dispatchEvent(new Event('input', { bubbles: true }));
		fill.dispatchEvent(new Event('change', { bubbles: true }));
		expect(objects.object('box')).toMatchObject({ fill: true, fillColor: '#00ff00' });
		expect(fillRow.classList).not.toContain('no-fill');
		expect(fill.title).toBe('');
	});
});

describe('the style buttons', () => {
	it('show the chosen style and say which is pressed', () => {
		const choose = vi.fn();
		const buttons = new ShapeStyleButtons('Shape style', choose);
		buttons.show(ShapeStyle.Fill);
		const pressed = [...buttons.element.querySelectorAll('button')].map((button) => [button.dataset.shapeStyle, button.getAttribute('aria-pressed')]);
		expect(pressed).toEqual([
			[ShapeStyle.Outline, 'false'],
			[ShapeStyle.Fill, 'true'],
			[ShapeStyle.OutlineAndFill, 'false'],
		]);
		buttons.element.querySelector<HTMLButtonElement>(`[data-shape-style="${ShapeStyle.OutlineAndFill}"]`)!.click();
		expect(choose).toHaveBeenCalledWith(ShapeStyle.OutlineAndFill);
	});

	it('restyle a selected shape in one undo step, from the tools\' fill colour, and make it the tools\' style', () => {
		document.body.innerHTML = '<div id="properties"></div>';
		const objects = new AnnotationDocument();
		objects.add(structuredClone(BOX));
		objects.select('box');
		const chooseShapeStyle = vi.fn();
		new SelectedObjectPropertiesController(objects, document.querySelector('#properties')!, undefined, undefined, { fillColor: () => '#ff0000', chooseShapeStyle });
		const style = document.querySelector('[aria-label="Selected object style"]')!;
		const size = document.querySelector<HTMLElement>('[data-object-property="size"]')!;
		style.querySelector<HTMLButtonElement>(`[data-shape-style="${ShapeStyle.Fill}"]`)!.click();
		expect(objects.object('box')).toMatchObject({ fill: true, fillColor: '#ff0000', width: 0 });
		expect(chooseShapeStyle).toHaveBeenCalledWith(ShapeStyle.Fill);
		expect(size.classList).toContain('hidden');
		objects.undo();
		expect(objects.object('box')).toMatchObject({ fill: false, width: 4 });
		objects.add({ id: 'note', type: AnnotationObjectTypeId.Text, at: { x: 0, y: 9 }, text: 'a', color: '#000000', size: 9 });
		objects.select('note');
		expect(style.classList).toContain('hidden');
		style.querySelector<HTMLButtonElement>(`[data-shape-style="${ShapeStyle.Fill}"]`)!.click();
		expect(objects.object('note')).not.toHaveProperty('fill');
	});
});

describe('the colour keys', () => {
	it('reset the colours with D and swap them with Shift+X, while X alone still chooses its tool', async () => {
		const { CanvasDocument } = await import('../../core/document/imageDocument');
		const { DrawingController } = await import('./drawingController');
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		const drawing = new DrawingController(model, undefined, new AnnotationDocument());
		const line = document.querySelector<HTMLInputElement>('#colorInput')!;
		const fill = document.querySelector<HTMLInputElement>('#fillColorInput')!;
		line.value = '#123456';
		fill.value = '#abcdef';
		expect(drawing.handleShortcut('x', true)).toBe(true);
		expect([line.value, fill.value]).toEqual(['#abcdef', '#123456']);
		expect(drawing.handleShortcut('d', false)).toBe(true);
		expect([line.value, fill.value]).toEqual([DEFAULT_TOOL_COLORS.line, DEFAULT_TOOL_COLORS.fill]);
		expect(drawing.handleShortcut('r', false)).toBe(true);
		expect(drawing.tool).toBe(ShapeToolId.Rectangle);
		expect(drawing.handleShortcut('q', false)).toBe(false);
	});
});
