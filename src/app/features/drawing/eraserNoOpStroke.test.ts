import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

describe('object-local erasing', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'eraser-coverage',
			width: 40,
			height: 40,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, model.width, model.height);
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, undefined, objects);
	});

	it('does nothing when no editable object is selected', () => {
		drawing.select(PaintToolId.Eraser);
		pointer(model.overlay, 'pointerdown', 10, 10);
		pointer(model.overlay, 'pointerup', 10, 10);

		expect(objects.state.objects).toHaveLength(0);
		expect(objects.selected).toBeNull();
	});

	it('masks the selected object without creating an eraser layer', () => {
		objects.add(stroke('selected', 5));
		objects.add(stroke('underneath', 25));
		objects.select('selected');
		const objectCount = objects.state.objects.length;
		const selectedSize = (objects.object('selected') as StrokeAnnotation).size;

		drawing.select(PaintToolId.Eraser);
		pointer(model.overlay, 'pointerdown', 10, 10);
		pointer(model.overlay, 'pointermove', 15, 15);
		pointer(model.overlay, 'pointerup', 15, 15);

		expect(objects.state.objects).toHaveLength(objectCount);
		expect(objects.object('selected')?.erasures).toHaveLength(1);
		expect(objects.object('underneath')?.erasures).toBeUndefined();
		expect(objects.object('selected')?.erasures?.[0]?.strokePointLimit).toBe(
			stroke('selected', 5).points.length,
		);
		expect((objects.object('selected') as StrokeAnnotation).size).toBe(
			selectedSize,
		);
	});

	it('keeps eraser size independent from the selected stroke size', () => {
		objects.add(stroke('selected', 5));
		objects.select('selected');
		const selectedSize = (objects.object('selected') as StrokeAnnotation).size;

		drawing.select(PaintToolId.Eraser);
		const eraserSize = document.querySelector<HTMLInputElement>('#sizeInput')!;
		eraserSize.value = '80';
		eraserSize.dispatchEvent(new Event('input', { bubbles: true }));
		eraserSize.dispatchEvent(new Event('change', { bubbles: true }));

		expect(
			document.querySelector('.tool-options')?.classList,
		).not.toContain('editing-selected-object');
		expect((objects.object('selected') as StrokeAnnotation).size).toBe(
			selectedSize,
		);
		pointer(model.overlay, 'pointerdown', 10, 10);
		pointer(model.overlay, 'pointermove', 15, 15);
		pointer(model.overlay, 'pointerup', 15, 15);
		expect((objects.object('selected') as StrokeAnnotation).size).toBe(
			selectedSize,
		);
	});

	it('restores and reapplies the selected object mask through history', () => {
		objects.add(stroke('selected', 5));
		objects.select('selected');
		drawing.select(PaintToolId.Eraser);
		pointer(model.overlay, 'pointerdown', 10, 10);
		pointer(model.overlay, 'pointerup', 10, 10);
		expect(objects.object('selected')?.erasures).toHaveLength(1);

		objects.undo();
		expect(objects.object('selected')?.erasures).toBeUndefined();
		objects.redo();
		expect(objects.object('selected')?.erasures).toHaveLength(1);
	});
});

function stroke(id: string, offset: number): StrokeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: offset, y: offset, pressure: 1 },
			{ x: offset + 15, y: offset + 15, pressure: 1 },
		],
		rect: { x: offset, y: offset, width: 15, height: 15 },
		color: '#000000',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
	};
}

function pointer(
	target: HTMLCanvasElement,
	type: string,
	x: number,
	y: number,
): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			pointerId: 9,
			clientX: x,
			clientY: y,
		}),
	);
}
