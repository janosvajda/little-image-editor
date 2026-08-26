import { beforeEach, describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';
import { UtilityToolId, ShapeToolId } from '../../core/document/appTypes';

describe('retained fill drawing paths', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'fill-coverage',
			width: 4,
			height: 4,
			transparent: false,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, model.width, model.height);
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, undefined, objects);
	});

	it('creates a retained fill object with calculated run bounds', () => {
		drawing.select(UtilityToolId.Fill);
		pointer(model.overlay, 'pointerdown', 1, 1);

		expect(objects.selected).toMatchObject({
			type: AnnotationObjectTypeId.Fill,
			rect: { x: 0, y: 0, width: 4, height: 4 },
		});
	});

	it('ignores drawing while the document is closed and tiny shapes', () => {
		model.close();
		drawing.select(ShapeToolId.Rectangle);
		pointer(model.overlay, 'pointerdown', 1, 1);
		pointer(model.overlay, 'pointerup', 1, 1);
		expect(objects.state.objects).toHaveLength(0);

		model.create({
			name: 'shape-coverage',
			width: 4,
			height: 4,
			transparent: true,
			background: '#ffffff',
		});
		drawing.select(ShapeToolId.Rectangle);
		pointer(model.overlay, 'pointerdown', 1, 1);
		pointer(model.overlay, 'pointerup', 1, 1);
		expect(objects.state.objects).toHaveLength(0);
	});
});

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
