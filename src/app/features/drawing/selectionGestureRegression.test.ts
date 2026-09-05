import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const CanvasSize = 200;
const PointerId = 71;

describe('selection gestures do not change image content', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'selection', width: CanvasSize, height: CanvasSize, transparent: true, background: '#ffffff' });
		model.overlay.getBoundingClientRect = () => new DOMRect(0, 0, CanvasSize, CanvasSize);
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, undefined, objects);
	});

	it('removes both double-click marks and their undo entries before selecting a stroke', () => {
		drag(20, 80, 180, 80);
		const before = objects.snapshotSession();
		const id = objects.state.objects[0]!.id;
		doubleClick(100, 80);
		expect(objects.selectedId).toBe(id);
		expect(objects.snapshotSession()).toEqual(before);
		objects.undo();
		expect(objects.state.objects).toHaveLength(0);
	});

	it('selects a raster fragment without leaving marks in another paint layer', () => {
		drag(20, 160, 180, 160);
		objects.add({ id: 'crop', type: AnnotationObjectTypeId.RasterFragment, rect: { x: 40, y: 40, width: 80, height: 80 }, pixelWidth: 1, pixelHeight: 1, pixels: '/wAA/w==', rotation: 0 });
		drawing.select(PaintToolId.Brush);
		const before = objects.snapshotSession();
		doubleClick(80, 80);
		expect(objects.selectedId).toBe('crop');
		expect(objects.snapshotSession()).toEqual(before);
	});

	it('continues painting the same raster after undo clears the selection', () => {
		objects.add({ id: 'crop', type: AnnotationObjectTypeId.RasterFragment, rect: { x: 40, y: 40, width: 80, height: 80 }, pixelWidth: 1, pixelHeight: 1, pixels: '/wAA/w==', rotation: 0 });
		drawing.select(PaintToolId.Brush);
		drag(60, 60, 80, 80);
		objects.undo();
		expect(objects.selectedId).toBeNull();
		drag(70, 70, 90, 90);
		expect(objects.selectedId).toBe('crop');
		expect(objects.state.objects).toHaveLength(1);
	});

	it('preserves redo history when double-click selects a layer', () => {
		drag(20, 80, 180, 80);
		drag(20, 100, 180, 100);
		objects.undo();
		const before = objects.snapshotSession();
		doubleClick(100, 80);
		expect(objects.snapshotSession()).toEqual(before);
		expect(objects.canRedo).toBe(true);
	});

	it('selects the top object through the selected lower object bounding box', () => {
		for (const id of ['bottom', 'top']) objects.add({ id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x: 20, y: 20, width: 160, height: 160 }, color: '#ff0000', width: 2, opacity: 1, fill: true });
		drawing.editObject('bottom');
		const before = objects.snapshotSession();
		click(100, 100);
		expect(objects.selectedId).toBe('top');
		expect(objects.snapshotSession()).toEqual(before);
	});

	it('does not start drawing for a secondary-button gesture', () => {
		pointer('pointerdown', 50, 50, 2);
		pointer('pointerup', 50, 50, 2);
		expect(objects.state.objects).toHaveLength(0);
	});

	it('paints inside a raster crop near its corner without resizing it', () => {
		const rect = { x: 40, y: 40, width: 80, height: 80 };
		objects.add({ id: 'crop', type: AnnotationObjectTypeId.RasterFragment, rect, pixelWidth: 1, pixelHeight: 1, pixels: '/wAA/w==', rotation: 0 });
		drawing.editObject('crop');
		drawing.select(PaintToolId.Brush);
		drag(42, 42, 70, 70);
		expect(objects.selectedId).toBe('crop');
		expect(objects.object('crop')?.rect).toEqual(rect);
		expect(objects.state.objects).toHaveLength(1);
	});

	function click(x: number, y: number): void { pointer('pointerdown', x, y); pointer('pointerup', x, y); }
	function doubleClick(x: number, y: number): void {
		click(x, y); click(x, y);
		model.overlay.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y }));
	}
	function drag(fromX: number, fromY: number, toX: number, toY: number): void {
		pointer('pointerdown', fromX, fromY); pointer('pointermove', toX, toY); pointer('pointerup', toX, toY);
	}
	function pointer(type: string, x: number, y: number, button = 0): void {
		model.overlay.dispatchEvent(new PointerEvent(type, { bubbles: true, button, buttons: type === 'pointerup' ? 0 : 1, pointerId: PointerId, clientX: x, clientY: y }));
	}
});
