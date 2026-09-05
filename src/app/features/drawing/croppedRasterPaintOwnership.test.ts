import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from '../layers/layersController';
import { DrawingController } from './drawingController';

const CanvasSize = 160;
const PointerId = 41;

describe('cropped raster paint ownership', () => {
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

	it.each([true, false])('keeps paint in its intended target (inside crop: %s)', (insideCrop) => {
		drawPath(10, 10, 30, 30);
		const original = structuredClone(objects.state.objects[0]!);
		objects.add({
			id: 'cropped-raster',
			type: AnnotationObjectTypeId.RasterFragment,
			rect: { x: 40, y: 40, width: 60, height: 60 },
			pixelWidth: 1,
			pixelHeight: 1,
			pixels: '/wAA/w==',
			rotation: 0,
		});
		const beforePainting = objects.snapshotSession();
		drawing.select(PaintToolId.Brush);
		drawPath(insideCrop ? 50 : 120, 50, 70, 70);
		drawPath(60, 60, 80, 80);

		expect(objects.state.objects).toHaveLength(insideCrop ? 2 : 3);
		expect(objects.state.objects[0]).toEqual(original);
		const painted = objects.snapshotSession();
		if (insideCrop) {
			expect(objects.selectedId).toBe('cropped-raster');
			expect(objects.state.objects[1]?.type).toBe(AnnotationObjectTypeId.RasterFragment);
		} else {
			expect(objects.state.objects[2]?.type).toBe(AnnotationObjectTypeId.Stroke);
			expect(objects.activePaintLayer?.pathStarts).toHaveLength(1);
		}
		expect(layers.panel.list.querySelectorAll('.layer-object-row.active')).toHaveLength(1);
		objects.undo();
		objects.undo();
		expect(objects.state).toEqual(beforePainting.state);
		objects.redo();
		objects.redo();
		expect(objects.snapshotSession()).toEqual(painted);
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
