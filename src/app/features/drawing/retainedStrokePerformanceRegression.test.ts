import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PaintToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { ContentLayerCanvas } from '../annotations/contentLayerCanvas';
import { DrawingController } from './drawingController';

const CanvasSize = {
	Width: 400,
	Height: 200,
} as const;
const PointerId = 1;

describe('retained stroke interaction performance contract', () => {
	let animationFrames: FrameRequestCallback[];

	beforeEach(() => {
		animationFrames = [];
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			animationFrames.push(callback);
			return animationFrames.length;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
	});

	it('coalesces pointer rendering and persists only the completed stroke', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'performance-regression',
			width: CanvasSize.Width,
			height: CanvasSize.Height,
			transparent: false,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			({
				left: 0,
				top: 0,
				width: CanvasSize.Width,
				height: CanvasSize.Height,
				right: CanvasSize.Width,
				bottom: CanvasSize.Height,
				x: 0,
				y: 0,
				toJSON: vi.fn(),
			}) satisfies DOMRect;
		const objects = new AnnotationDocument();
		const drawing = new DrawingController(model, undefined, objects);
		new ContentLayerCanvas(
			model,
			{
				addCanvasLayer: (layer: HTMLCanvasElement) =>
					model.overlay.before(layer),
			},
			objects,
			vi.fn(),
		);
		const persist = vi.spyOn(model, 'setToolbarState');
		persist.mockClear();
		drawing.select(PaintToolId.Brush);
		persist.mockClear();
		expect(model.hasImage).toBe(true);
		expect(model.layers.isEditable(CoreLayerId.Objects)).toBe(true);

		dispatchPointer(model.overlay, 'pointerdown', 10, 20);
		expect(objects.state.objects).toHaveLength(1);
		for (let x = 11; x <= 210; x += 1)
			dispatchPointer(model.overlay, 'pointermove', x, 20 + (x % 20));

		expect(animationFrames).toHaveLength(1);
		expect(persist).not.toHaveBeenCalled();
		expect(objects.snapshotSession().history).toHaveLength(1);

		animationFrames.shift()!(performance.now());
		dispatchPointer(model.overlay, 'pointerup', 210, 30);

		expect(persist).toHaveBeenCalledTimes(1);
		expect(objects.snapshotSession().history).toHaveLength(2);
		expect(objects.state.objects).toHaveLength(1);
		expect(objects.state.objects[0]).toMatchObject({
			type: AnnotationObjectTypeId.Stroke,
			tool: PaintToolId.Brush,
		});
	});
});

function dispatchPointer(
	target: HTMLElement,
	type: string,
	x: number,
	y: number,
): void {
	target.dispatchEvent(pointerEvent(type, x, y));
}

function pointerEvent(type: string, x: number, y: number): PointerEvent {
	return new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: type === 'pointerup' ? 0 : 1,
			pointerId: PointerId,
			clientX: x,
			clientY: y,
		});
}
