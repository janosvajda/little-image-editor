import { describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const CanvasSize = 120;

describe('paint layer style isolation', () => {
	it('applies changed brush settings only to the next path', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'style-isolation',
			width: CanvasSize,
			height: CanvasSize,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, CanvasSize, CanvasSize);
		const objects = new AnnotationDocument();
		const drawing = new DrawingController(model, undefined, objects);
		drawing.select(PaintToolId.Brush);
		draw(model.overlay, 10, 10, 30, 30);

		const color = document.querySelector<HTMLInputElement>('#colorInput')!;
		const size = document.querySelector<HTMLInputElement>('#sizeInput')!;
		color.value = '#12ab34';
		color.dispatchEvent(new Event('input', { bubbles: true }));
		size.value = '42';
		size.dispatchEvent(new Event('input', { bubbles: true }));
		draw(model.overlay, 60, 60, 90, 90);

		const layer = objects.state.objects[0];
		expect(layer?.type).toBe(AnnotationObjectTypeId.Stroke);
		if (layer?.type !== AnnotationObjectTypeId.Stroke) return;
		expect(layer.pathStyles).toHaveLength(2);
		expect(layer.pathStyles?.[0]).toMatchObject({
			color: '#ffffff',
			size: 12,
		});
		expect(layer.pathStyles?.[1]).toMatchObject({
			color: '#12ab34',
			size: 42,
		});
		expect(document.querySelector('.selected-object-options')?.classList).toContain(
			'hidden',
		);
	});
});

function draw(
	target: HTMLCanvasElement,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
): void {
	for (const [type, x, y, buttons] of [
		['pointerdown', fromX, fromY, 1],
		['pointermove', toX, toY, 1],
		['pointerup', toX, toY, 0],
	] as const)
		target.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				button: 0,
				buttons,
				pointerId: 52,
				clientX: x,
				clientY: y,
			}),
		);
}
