import { describe, expect, it } from 'vitest';
import {
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
} from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { ShapeHandleMetrics } from '../../core/geometry/shapeTransformHelpers';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { SelectionPresentation } from '../annotations/selectionOverlayRenderer';
import { DrawingController } from './drawingController';
import { selectionPresentationFor, toolEditsLayer } from './drawingToolBehavior';

type TestPoint = Readonly<{ x: number; y: number }>;

const Surface = { width: 240, height: 160 } as const;
const Drawn = { from: { x: 30, y: 30 }, to: { x: 90, y: 70 } } as const;
const MoveBy = { x: 20, y: 15 } as const;
const GrowBy = { x: 25, y: 10 } as const;
const HALF = 2;

function setup(): { drawing: DrawingController; shapes: AnnotationDocument; overlay: HTMLCanvasElement } {
	const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
	const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
	const model = new CanvasDocument(canvas, overlay);
	model.create({ name: 'shape-tool-editing', ...Surface, transparent: false, background: '#fff' });
	overlay.getBoundingClientRect = () =>
		({ left: 0, top: 0, right: Surface.width, bottom: Surface.height, x: 0, y: 0, ...Surface }) as DOMRect;
	const shapes = new AnnotationDocument();
	const drawing = new DrawingController(model, undefined, shapes);
	drawing.select(ShapeToolId.Rectangle);
	drag(overlay, Drawn.from, Drawn.to);
	return { drawing, shapes, overlay };
}

describe('shape tools edit the shape they selected', () => {
	it('move the selected shape by dragging the shape itself', () => {
		const { shapes, overlay } = setup();
		const inside = { x: Drawn.from.x + 1, y: (Drawn.from.y + Drawn.to.y) / HALF };
		drag(overlay, inside, { x: inside.x + MoveBy.x, y: inside.y + MoveBy.y });
		expect(shapes.state.objects).toHaveLength(1);
		expect(shapes.selected).toEqual(
			expect.objectContaining({
				rect: expect.objectContaining({ x: Drawn.from.x + MoveBy.x, y: Drawn.from.y + MoveBy.y }),
			}),
		);
	});

	it('resize the selected shape from a corner', () => {
		const { shapes, overlay } = setup();
		drag(overlay, Drawn.to, { x: Drawn.to.x + GrowBy.x, y: Drawn.to.y + GrowBy.y });
		expect(shapes.state.objects).toHaveLength(1);
		expect(shapes.selected).toEqual(
			expect.objectContaining({
				rect: {
					x: Drawn.from.x,
					y: Drawn.from.y,
					width: Drawn.to.x - Drawn.from.x + GrowBy.x,
					height: Drawn.to.y - Drawn.from.y + GrowBy.y,
				},
			}),
		);
	});

	it('draw a new shape next to the selected one instead of rotating it', () => {
		const { shapes, overlay } = setup();
		const besideRightEdge = { x: Drawn.to.x + ShapeHandleMetrics.Offset / HALF, y: Drawn.from.y + MoveBy.y };
		drag(overlay, besideRightEdge, { x: Surface.width - 1, y: Surface.height - 1 });
		expect(shapes.state.objects).toHaveLength(2);
		expect(shapes.state.objects[0]?.rotation ?? 0).toBe(0);
	});
});

describe('choosing a layer from the layer list', () => {
	it('keeps a tool that edits the layer and otherwise switches to Select', () => {
		const { drawing, shapes } = setup();
		const shape = shapes.state.objects[0]!;
		drawing.select(ShapeToolId.Line);
		drawing.revealItem(shape.id);
		expect(drawing.tool).toBe(ShapeToolId.Line);
		drawing.select(PaintToolId.Brush);
		drawing.revealItem(shape.id);
		expect(drawing.tool).toBe(UtilityToolId.Select);
		expect(shapes.selected?.id).toBe(shape.id);
	});
});

describe('which tools edit a layer in place', () => {
	it('keeps Select and the eraser for every layer, and other tools for their own kind', () => {
		for (const type of Object.values(AnnotationObjectTypeId)) {
			expect(toolEditsLayer(UtilityToolId.Select, type)).toBe(true);
			expect(toolEditsLayer(PaintToolId.Eraser, type)).toBe(true);
			expect(toolEditsLayer(UtilityToolId.Zoom, type)).toBe(false);
			expect(toolEditsLayer(ShapeToolId.Line, type)).toBe(type === AnnotationObjectTypeId.Shape);
			expect(toolEditsLayer(PaintToolId.Brush, type)).toBe(type === AnnotationObjectTypeId.Stroke);
		}
	});

	it('shows transform controls with Select and shape tools only', () => {
		expect(selectionPresentationFor(UtilityToolId.Select)).toBe(SelectionPresentation.Transform);
		expect(selectionPresentationFor(ShapeToolId.Arrow)).toBe(SelectionPresentation.Transform);
		expect(selectionPresentationFor(UtilityToolId.Crop)).toBe(SelectionPresentation.Frame);
		expect(selectionPresentationFor(PaintToolId.Brush)).toBe(SelectionPresentation.Hidden);
	});
});

function drag(target: HTMLElement, from: TestPoint, to: TestPoint): void {
	for (const [type, point] of [
		['pointerdown', from],
		['pointermove', to],
		['pointerup', to],
	] as const)
		target.dispatchEvent(
			new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y }),
		);
}
