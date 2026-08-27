import { describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

function pointer(target: HTMLElement, type: string, x: number, y: number): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			clientX: x,
			clientY: y,
			pointerId: 1,
		}),
	);
}

describe('retained stroke continuation', () => {
	it('appends points to the selected stroke instead of adding an object', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'continue',
			width: 200,
			height: 100,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 200,
				bottom: 100,
				width: 200,
				height: 100,
				toJSON: () => ({}),
			}) satisfies DOMRect;
		const objects = new AnnotationDocument();
		new DrawingController(model, undefined, objects);
		const id = 'stroke';
		objects.add({
			id,
			type: AnnotationObjectTypeId.Stroke,
			layerId: CoreLayerId.Objects,
			tool: PaintToolId.Brush,
			points: [
				{ x: 10, y: 20, pressure: 1 },
				{ x: 40, y: 20, pressure: 1 },
			],
			sourceRect: { x: 8, y: 18, width: 34, height: 4 },
			rect: { x: 8, y: 18, width: 34, height: 4 },
			color: '#000000',
			size: 4,
			opacity: 1,
			hardness: 1,
			seed: 1,
			rotation: 0,
		});

		document
			.querySelector<HTMLButtonElement>('.selected-object-continue')!
			.click();
		pointer(model.overlay, 'pointerdown', 40, 20);
		pointer(model.overlay, 'pointermove', 70, 30);
		pointer(model.overlay, 'pointerup', 70, 30);

		const stroke = objects.object(id);
		expect(objects.state.objects).toHaveLength(1);
		expect(stroke?.type).toBe(AnnotationObjectTypeId.Stroke);
		if (stroke?.type === AnnotationObjectTypeId.Stroke)
			expect(stroke.points.at(-1)).toMatchObject({ x: 70, y: 30 });

		document
			.querySelector<HTMLButtonElement>('.selected-object-continue')!
			.click();
		pointer(model.overlay, 'pointerdown', 10, 20);
		pointer(model.overlay, 'pointermove', 5, 10);
		pointer(model.overlay, 'pointerup', 5, 10);
		const continuedFromStart = objects.object(id);
		if (continuedFromStart?.type === AnnotationObjectTypeId.Stroke)
			expect(continuedFromStart.points.at(-1)).toMatchObject({ x: 5, y: 10 });
	});
});
