import { describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const CanvasSize = { Width: 240, Height: 140 } as const;
const StrokeId = 'moved-stroke';

describe('paint object double-click stability', () => {
	it('does not transform a moved stroke when real double-click events jitter', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'double-click-stability',
			width: CanvasSize.Width,
			height: CanvasSize.Height,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () => canvasBounds();
		const objects = new AnnotationDocument();
		objects.add({
			id: StrokeId,
			type: AnnotationObjectTypeId.Stroke,
			layerId: CoreLayerId.Objects,
			tool: PaintToolId.Brush,
			points: [
				{ x: 20, y: 30, pressure: 1 },
				{ x: 100, y: 30, pressure: 1 },
			],
			sourceRect: { x: 18, y: 28, width: 84, height: 4 },
			rect: { x: 18, y: 28, width: 84, height: 4 },
			color: '#000000',
			size: 4,
			opacity: 1,
			hardness: 1,
			seed: 1,
			rotation: 0,
		});
		objects.move(StrokeId, { x: 60, y: 40 });
		const drawing = new DrawingController(model, undefined, objects);
		drawing.editObject(StrokeId);
		const before = structuredClone(objects.object(StrokeId));

		for (const pointerId of [41, 42]) {
			pointer(model.overlay, 'pointerdown', 160, 70, pointerId);
			pointer(model.overlay, 'pointermove', 161, 71, pointerId);
			pointer(model.overlay, 'pointerup', 161, 71, pointerId);
		}
		model.overlay.dispatchEvent(
			new MouseEvent('dblclick', {
				bubbles: true,
				button: 0,
				clientX: 161,
				clientY: 71,
			}),
		);

		expect(objects.object(StrokeId)).toEqual(before);
		expect(objects.selectedId).toBe(StrokeId);
	});
});

function pointer(
	target: HTMLCanvasElement,
	type: string,
	x: number,
	y: number,
	pointerId: number,
): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			buttons: type === 'pointerup' ? 0 : 1,
			clientX: x,
			clientY: y,
			pointerId,
		}),
	);
}

function canvasBounds(): DOMRect {
	return {
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: CanvasSize.Width,
		bottom: CanvasSize.Height,
		width: CanvasSize.Width,
		height: CanvasSize.Height,
		toJSON: () => ({}),
	};
}
