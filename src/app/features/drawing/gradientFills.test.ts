import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import {
	evenStops,
	type Gradient,
	GradientKind,
	gradientOf,
	inFrame,
	isGradient,
	linearGradient,
	radialGradient,
	relativeToFrame,
	withKind,
} from '../../core/geometry/gradient';
import { parsePathData } from '../../core/geometry/vectorPath';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import { AnnotationObjectTypeId, LineDash, type ShapeAnnotation } from '../annotations/annotationTypes';
import { EditableObjectPropertyId, editableObjectProperties, FillStyle, setEditableObjectProperty } from '../annotations/editableObjectProperties';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { parseDrawScript } from '../assistant/drawScript';
import { GradientHandles } from './gradientHandles';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';

const BOX: ShapeAnnotation = {
	id: 'box',
	type: AnnotationObjectTypeId.Shape,
	shape: ShapeToolId.Rectangle,
	rect: { x: 100, y: 50, width: 200, height: 100 },
	color: '#333333',
	width: 2,
	opacity: 1,
	fill: true,
	fillGradient: linearGradient(['#ff6600', '#ffee00']),
};

let model: CanvasDocument;
beforeEach(() => {
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'gradients', width: 400, height: 300, transparent: false, background: '#ffffff' });
});

describe('a gradient', () => {
	it('spreads its colours evenly and runs left to right, or at an angle', () => {
		expect(evenStops(['#000000', '#888888', '#ffffff']).map(({ offset }) => offset)).toEqual([0, 0.5, 1]);
		expect(linearGradient(['#000000', '#ffffff'])).toMatchObject({ start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } });
		const down = linearGradient(['#000000', '#ffffff'], 90);
		expect(down.start.x).toBeCloseTo(0.5);
		expect(down.start.y).toBeCloseTo(0);
		expect(down.end.y).toBeCloseTo(1);
		expect(radialGradient(['#000000', '#ffffff'])).toMatchObject({ kind: GradientKind.Radial, start: { x: 0.5, y: 0.5 }, end: { x: 1, y: 0.5 } });
		expect(gradientOf(GradientKind.Radial, ['#000000', '#ffffff'], 45)).toEqual(radialGradient(['#000000', '#ffffff']));
	});

	it('changes kind keeping its colours, and sits in a frame relative to its sides', () => {
		const three = linearGradient(['#ff0000', '#00ff00', '#0000ff']);
		expect(withKind(three, GradientKind.Radial).stops).toEqual(three.stops);
		const frame = { x: 100, y: 50, width: 200, height: 100 };
		expect(inFrame(frame, { x: 0.5, y: 1 })).toEqual({ x: 200, y: 150 });
		expect(relativeToFrame(frame, { x: 200, y: 150 })).toEqual({ x: 0.5, y: 1 });
		expect(relativeToFrame({ x: 0, y: 0, width: 0, height: 0 }, { x: 9, y: 9 })).toEqual({ x: 0.5, y: 0.5 });
	});

	it('is recognised in a file only when whole', () => {
		const good: Gradient = linearGradient(['#000000', '#ffffff']);
		expect(isGradient(good)).toBe(true);
		expect(isGradient({ ...good, kind: 'conic' })).toBe(false);
		expect(isGradient({ ...good, stops: good.stops.slice(0, 1) })).toBe(false);
		expect(isGradient({ ...good, stops: [{ offset: 2, color: '#000000' }, ...good.stops] })).toBe(false);
		expect(isGradient({ ...good, start: { x: 'left', y: 0 } })).toBe(false);
		expect(isGradient(null)).toBe(false);
	});
});

describe('filling with a gradient', () => {
	it('paints a shape\'s fill along its gradient, laid over its frame, under its outline', () => {
		const context = document.querySelector<HTMLCanvasElement>('#overlay')!.getContext('2d')!;
		const addColorStop = vi.fn();
		const createLinearGradient = vi.fn(() => ({ addColorStop }));
		const fill = vi.fn();
		const stroke = vi.fn();
		Object.assign(context, { createLinearGradient, fill, stroke });
		renderAnnotationObject(context, document.createElement('canvas'), BOX);
		expect(createLinearGradient).toHaveBeenCalledWith(100, 100, 300, 100);
		expect(addColorStop.mock.calls).toEqual([
			[0, '#ff6600'],
			[1, '#ffee00'],
		]);
		expect(fill).toHaveBeenCalledOnce();
		expect(stroke).toHaveBeenCalledOnce();
	});

	it('paints a path from its centre out with a radial gradient, and its line with a line gradient', () => {
		const context = document.querySelector<HTMLCanvasElement>('#overlay')!.getContext('2d')!;
		const createRadialGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
		const createLinearGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
		Object.assign(context, { createRadialGradient, createLinearGradient });
		renderAnnotationObject(context, document.createElement('canvas'), {
			id: 'blob',
			type: AnnotationObjectTypeId.Path,
			contours: parsePathData('M0 0 L100 0 L100 100 L0 100 Z'),
			color: '#000000',
			width: 2,
			opacity: 1,
			fill: true,
			dash: LineDash.Solid,
			fillGradient: radialGradient(['#ffffff', '#000000']),
			lineGradient: linearGradient(['#ff0000', '#0000ff']),
		});
		expect(createRadialGradient).toHaveBeenCalledWith(50, 50, 0, 50, 50, 50);
		expect(createLinearGradient).toHaveBeenCalledWith(0, 50, 100, 50);
	});

});

describe('choosing a fill', () => {
	it('starts a gradient from the fill colour, changes its kind keeping its colours, and goes back to solid keeping the first', () => {
		const box: ShapeAnnotation = { ...structuredClone(BOX), fillGradient: undefined, fillColor: '#123456' };
		setEditableObjectProperty(box, EditableObjectPropertyId.FillStyle, FillStyle.Linear);
		expect(box.fillGradient!.stops.map(({ color }) => color)).toEqual(['#123456', '#ffffff']);
		setEditableObjectProperty(box, EditableObjectPropertyId.FillColorEnd, '#00ff00');
		setEditableObjectProperty(box, EditableObjectPropertyId.FillStyle, FillStyle.Radial);
		expect(box.fillGradient).toMatchObject({ kind: GradientKind.Radial, stops: [{ color: '#123456' }, { color: '#00ff00' }] });
		setEditableObjectProperty(box, EditableObjectPropertyId.FillColor, '#abcdef');
		expect(editableObjectProperties(box)).toMatchObject({ fillStyle: FillStyle.Radial, fillColor: '#abcdef', fillColorEnd: '#00ff00' });
		setEditableObjectProperty(box, EditableObjectPropertyId.FillStyle, FillStyle.Solid);
		expect(box).not.toHaveProperty('fillGradient');
		expect(box.fillColor).toBe('#abcdef');
		expect(editableObjectProperties(box)).not.toHaveProperty('fillColorEnd');
	});

	it('shows the style and both colours beside Fill for a gradient, and none of them for an item without a fill', () => {
		document.body.innerHTML = '<div id="properties"></div>';
		const objects = new AnnotationDocument();
		objects.add(structuredClone(BOX));
		const parent = document.querySelector<HTMLElement>('#properties')!;
		new SelectedObjectPropertiesController(objects, parent);
		const style = parent.querySelector<HTMLSelectElement>('[aria-label="Selected object fill style"]')!;
		expect(style.value).toBe(FillStyle.Linear);
		expect(parent.querySelector('[data-object-property="fillColorEnd"]')!.classList).not.toContain('hidden');
		style.value = FillStyle.Solid;
		style.dispatchEvent(new Event('change', { bubbles: true }));
		expect(objects.selected).not.toHaveProperty('fillGradient');
		expect(parent.querySelector('[data-object-property="fillColorEnd"]')!.classList).toContain('hidden');
	});

	it('reads gradient fills in the draw script, written as in CSS, and names a gradient with too few colours', () => {
		const objects = new AnnotationDocument();
		const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
		const [linear] = parseDrawScript('rect 0,0 100x50 #333333 fill linear(90deg,#ff6600,#ffee00)').commands;
		runner.run(linear!);
		expect(objects.state.objects[0]).toMatchObject({ fill: true, fillGradient: { kind: GradientKind.Linear } });
		expect((objects.state.objects[0] as ShapeAnnotation).fillGradient!.end.y).toBeCloseTo(1);
		const [radial] = parseDrawScript('path "M0 0 L10 0 L10 10 Z" #000000 fill radial(#ffffff,#000000,#ff0000)').commands;
		expect(radial).toMatchObject({ fill: true, fillGradient: { kind: GradientKind.Radial } });
		expect(() => parseDrawScript('rect 0,0 10x10 #000000 fill linear(#ff0000)')).toThrow('Line 1: a gradient needs at least 2 colours.');
		expect(() => parseDrawScript('rect 0,0 10x10 #000000 fill linear(red,blue)')).toThrow('expected a colour such as #d62828');
	});
});

describe('a gradient\'s points on the canvas', () => {
	const shown = () => {
		const objects = new AnnotationDocument();
		objects.add(structuredClone(BOX));
		objects.select('box');
		let suppressed = false;
		const handles = new GradientHandles(model, objects, () => suppressed);
		return { objects, handles, suppress: () => void (suppressed = true) };
	};

	it('are taken only with the tool that moves items, and drag the gradient\'s end in one undo step', () => {
		const { objects, handles } = shown();
		expect(handles.begin({ x: 300, y: 100 }, 1)).toBeNull();
		handles.setActive(true);
		const drag = handles.begin({ x: 300, y: 100 }, 1)!;
		drag.update({ x: 200, y: 150 }, 1);
		drag.complete({ x: 200, y: 150 });
		expect((objects.object('box') as ShapeAnnotation).fillGradient!.end).toEqual({ x: 0.5, y: 1 });
		objects.undo();
		expect((objects.object('box') as ShapeAnnotation).fillGradient!.end).toEqual({ x: 1, y: 0.5 });
	});

	it('are not taken away from the item\'s own handles, nor while something else has the overlay', () => {
		const { handles, suppress } = shown();
		handles.setActive(true);
		expect(handles.begin({ x: 200, y: 60 }, 1)).toBeNull();
		suppress();
		expect(handles.begin({ x: 100, y: 100 }, 1)).toBeNull();
	});
});
