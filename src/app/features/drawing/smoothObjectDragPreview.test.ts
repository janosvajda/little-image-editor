import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const CanvasSize = { Width: 200, Height: 120 } as const;

describe('smooth retained-object drag preview', () => {
	it('moves immediately, restores clicks, and preserves exact drag distance', () => {
		const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			overlay,
		);
		model.create({
			name: 'smooth-drag',
			width: CanvasSize.Width,
			height: CanvasSize.Height,
			transparent: false,
			background: ColorPalette.White,
		});
		overlay.getBoundingClientRect = () =>
			({
				left: 0,
				top: 0,
				width: CanvasSize.Width,
				height: CanvasSize.Height,
				right: CanvasSize.Width,
				bottom: CanvasSize.Height,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			}) as DOMRect;
		const objects = new AnnotationDocument();
		objects.add({
			id: 'shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 20, y: 20, width: 40, height: 30 },
			rotation: 0,
			color: ColorPalette.Black,
			width: 2,
			opacity: 1,
			fill: false,
		});
		new DrawingController(model, undefined, objects);

		dispatch(overlay, 'pointerdown', 30, 30);
		dispatch(overlay, 'pointermove', 31, 30);
		expect(objects.selected?.rect.x).toBe(21);
		dispatch(overlay, 'pointerup', 31, 30);
		expect(objects.selected?.rect.x).toBe(20);

		dispatch(overlay, 'pointerdown', 30, 30);
		dispatch(overlay, 'pointermove', 31, 30);
		dispatch(overlay, 'pointermove', 40, 30);
		dispatch(overlay, 'pointerup', 40, 30);
		expect(objects.selected?.rect.x).toBe(30);
	});
});

function dispatch(
	target: HTMLElement,
	type: string,
	clientX: number,
	clientY: number,
): void {
	target.dispatchEvent(
		new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			clientX,
			clientY,
		}),
	);
}
