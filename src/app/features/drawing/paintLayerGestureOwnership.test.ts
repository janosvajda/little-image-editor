import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from '../layers/layersController';
import { DrawingController } from './drawingController';

const CanvasSize = 160;
const PointerId = 41;

describe('paint layer gesture ownership', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;
	let layers: LayersController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'paint-layers',
			width: CanvasSize,
			height: CanvasSize,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, CanvasSize, CanvasSize);
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, undefined, objects);
		layers = new LayersController(model, objects);
		drawing.select(PaintToolId.Brush);
	});

	it('keeps repeated freehand gestures in one layer until explicitly split', () => {
		drawPath(10, 10, 30, 30);
		drawPath(50, 50, 70, 70);

		const strokes = objects.state.objects;
		expect(strokes).toHaveLength(2);
		expect(strokes.every((item) => item.type === AnnotationObjectTypeId.Stroke)).toBe(true);
		expect(objects.state.layers).toHaveLength(1);
		expect(objects.state.layers[0]?.itemIds).toEqual(strokes.map(({ id }) => id));
		expect(layers.panel.list.querySelectorAll('.layer-object-row')).toHaveLength(1);
		const [first, second] = strokes;
		objects.undo();
		expect(objects.state.objects.map(({ id }) => id)).toEqual([first!.id]);
		objects.redo();
		expect(objects.state.objects[1]).toMatchObject({ id: second!.id, points: (second as { points: unknown }).points });

		layers.panel.newPaintLayerButton.click();
		drawPath(90, 90, 110, 110);

		expect(objects.state.objects).toHaveLength(3);
		expect(objects.state.layers.map((layer) => layer.itemIds.length)).toEqual([2, 1]);
		expect(layers.panel.list.querySelectorAll('.layer-object-row')).toHaveLength(2);
	});

	function drawPath(fromX: number, fromY: number, toX: number, toY: number): void {
		pointer('pointerdown', fromX, fromY);
		pointer('pointermove', toX, toY);
		pointer('pointerup', toX, toY);
	}

	function pointer(type: string, x: number, y: number): void {
		model.overlay.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				button: 0,
				buttons: type === 'pointerup' ? 0 : 1,
				pointerId: PointerId,
				clientX: x,
				clientY: y,
			}),
		);
	}
});
