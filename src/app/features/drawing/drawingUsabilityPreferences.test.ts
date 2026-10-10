import { beforeEach, describe, expect, it } from 'vitest';
import {
	MarkupToolId,
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
	type Point,
} from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { ProjectCodec } from '../projects/projectCodec';
import { ProjectEditorAdapter } from '../projects/projectEditorAdapter';
import { DrawingController } from './drawingController';

const Surface = { width: 200, height: 160 } as const;
const ChosenColor = { Paint: ColorPalette.JadeGreen, Number: ColorPalette.RubyRed } as const;
const PointerId = 71;

let model: CanvasDocument;
let objects: AnnotationDocument;
let drawing: DrawingController;

beforeEach(() => {
	model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	objects = new AnnotationDocument();
	drawing = new DrawingController(model, undefined, objects);
	drawing.setInitialColor('light');
	model.create({ name: 'preferences', ...Surface, transparent: true, background: ColorPalette.White });
	model.overlay.getBoundingClientRect = () => new DOMRect(0, 0, Surface.width, Surface.height);
});

describe('drawing colours follow explicit user choices', () => {
	it('starts numbered markers red without replacing the chosen paint colour', () => {
		changeColor(ChosenColor.Paint);
		drawing.select(MarkupToolId.Number);
		expect(colorInput().value).toBe(ColorPalette.Red);
		drag({ x: 30, y: 30 });
		expect(objects.state.objects[0]).toMatchObject({ type: AnnotationObjectTypeId.Step, color: ColorPalette.Red });
		drawing.select(PaintToolId.Pencil);
		expect(colorInput().value).toBe(ChosenColor.Paint);
	});

	it('shares the chosen paint colour across brushes and shapes, including reactivating Pencil', () => {
		drawing.select(PaintToolId.Pencil);
		changeColor(ChosenColor.Paint);
		drag({ x: 20, y: 20 }, { x: 40, y: 20 });
		for (const tool of [PaintToolId.Brush, ShapeToolId.Rectangle, UtilityToolId.Select, PaintToolId.Pencil])
			drawing.select(tool);
		drawing.select(PaintToolId.Pencil);
		drag({ x: 60, y: 60 }, { x: 80, y: 60 });
		expect(objects.state.objects).toHaveLength(2);
		for (const item of objects.state.objects)
			expect(item).toMatchObject({ type: AnnotationObjectTypeId.Stroke, color: ChosenColor.Paint });
	});

	it('remembers a colour edited on a selected shape for the next drawing', () => {
		drawing.select(ShapeToolId.Rectangle);
		drag({ x: 20, y: 20 }, { x: 60, y: 50 });
		changeColor(ChosenColor.Paint, document.querySelector<HTMLInputElement>('[aria-label="Selected object color"]')!);
		drawing.select(PaintToolId.Pencil);
		drag({ x: 100, y: 80 }, { x: 140, y: 80 });
		expect(objects.state.objects.at(-1)).toMatchObject({ color: ChosenColor.Paint });
	});

	it('remembering a marker colour does not replace the paint colour', () => {
		changeColor(ChosenColor.Paint);
		drawing.select(MarkupToolId.Number);
		drag({ x: 30, y: 30 });
		drawing.select(UtilityToolId.Select);
		objects.select(objects.state.objects[0]!.id);
		changeColor(ChosenColor.Number, document.querySelector<HTMLInputElement>('[aria-label="Selected object color"]')!);
		drawing.select(PaintToolId.Pencil);
		expect(colorInput().value).toBe(ChosenColor.Paint);
		drawing.select(MarkupToolId.Number);
		expect(colorInput().value).toBe(ChosenColor.Number);
		drag({ x: 80, y: 30 });
		expect(objects.state.objects.at(-1)).toMatchObject({ color: ChosenColor.Number });
	});

	it('merely selecting an older object leaves the creation colour alone', () => {
		drawing.select(ShapeToolId.Rectangle);
		drag({ x: 20, y: 20 }, { x: 60, y: 50 });
		drawing.select(PaintToolId.Pencil);
		changeColor(ChosenColor.Paint);
		drawing.select(UtilityToolId.Select);
		objects.select(objects.state.objects[0]!.id);
		drawing.select(PaintToolId.Pencil);
		expect(colorInput().value).toBe(ChosenColor.Paint);
	});

	it('preserves both colour profiles through the .limg persistence boundary', () => {
		changeColor(ChosenColor.Paint);
		drawing.select(MarkupToolId.Number);
		changeColor(ChosenColor.Number);
		drag({ x: 30, y: 30 });
		const codec = new ProjectCodec();
		const adapter = new ProjectEditorAdapter(model, objects);
		const source = codec.serializeEditorState(adapter.capture());
		model.create({ name: 'replacement', ...Surface, transparent: true, background: ColorPalette.White });
		adapter.restore(codec.toEditorState(codec.parse(source)));
		expect(colorInput().value).toBe(ChosenColor.Number);
		drawing.select(PaintToolId.Pencil);
		expect(colorInput().value).toBe(ChosenColor.Paint);
		drawing.select(MarkupToolId.Number);
		expect(colorInput().value).toBe(ChosenColor.Number);
	});

	it('keeps saved colours from projects whose tool profiles predate colour profiling', () => {
		model.setToolbarState('drawing', {
			activeTool: PaintToolId.Pencil,
			controls: { colorInput: ChosenColor.Paint, sizeInput: '24' },
			controlProfiles: { [PaintToolId.Pencil]: { sizeInput: '24' } },
		});
		model.restoreSession(model.snapshotSession());
		expect(colorInput().value).toBe(ChosenColor.Paint);
		expect(document.querySelector<HTMLInputElement>('#sizeInput')!.value).toBe('24');
		drawing.select(PaintToolId.Brush);
		expect(colorInput().value).toBe(ChosenColor.Paint);
	});
});

function colorInput(): HTMLInputElement {
	return document.querySelector<HTMLInputElement>('#colorInput')!;
}

function changeColor(color: string, input = colorInput()): void {
	input.value = color;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

function drag(from: Point, to: Point = from): void {
	for (const [type, point] of [['pointerdown', from], ['pointermove', to], ['pointerup', to]] as const)
		model.overlay.dispatchEvent(new PointerEvent(type, {
			bubbles: true, button: 0, pointerId: PointerId, clientX: point.x, clientY: point.y,
		}));
}
