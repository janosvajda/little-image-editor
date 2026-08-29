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

describe('stroke editing and movement isolation', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'stroke-editing',
			width: 100,
			height: 100,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, model.width, model.height);
		objects = new AnnotationDocument();
		objects.add(stroke());
		drawing = new DrawingController(model, undefined, objects);
	});

	it('selects the paint layer and appends a later brush gesture to it', () => {
		const original = objects.object('stroke') as StrokeAnnotation;
		original.erasures = [
			{
				points: [
					{ xRatio: 0.25, yRatio: 0.25, pressure: 1 },
					{ xRatio: 0.5, yRatio: 0.5, pressure: 1 },
				],
				sizeRatio: 0.1,
				opacity: 1,
				hardness: 1,
				strokePointLimit: original.points.length,
			},
		];
		pointer(model.overlay, 'dblclick', 40, 40);
		drawing.select(PaintToolId.Brush);
		const before = structuredClone(
			(objects.object('stroke') as StrokeAnnotation).points,
		);

		pointer(model.overlay, 'pointerdown', 40, 40);
		pointer(model.overlay, 'pointermove', 55, 55);
		pointer(model.overlay, 'pointerup', 55, 55);

		expect(objects.state.objects).toHaveLength(1);
		const edited = objects.object('stroke') as StrokeAnnotation;
		expect(edited.points.slice(0, before.length)).toEqual(before);
		expect(edited.pathStarts).toEqual([before.length]);
		expect(edited.erasures?.[0]?.strokePointLimit).toBe(before.length);
		expect(edited.points.at(-1)).toMatchObject({ x: 55, y: 55 });
	});
});

function stroke(): StrokeAnnotation {
	return {
		id: 'stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 20, y: 20, pressure: 1 },
			{ x: 60, y: 60, pressure: 1 },
		],
		rect: { x: 18, y: 18, width: 44, height: 44 },
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
			buttons: type === 'pointerup' ? 0 : 1,
			pointerId: 91,
			clientX: x,
			clientY: y,
		}),
	);
}
