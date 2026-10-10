import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId, ShapeToolId, type Point } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument, AnnotationHitTestScope } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { ProjectCodec } from '../projects/projectCodec';
import { ProjectEditorAdapter } from '../projects/projectEditorAdapter';
import { DrawingController } from './drawingController';

const Surface = { width: 200, height: 160 } as const;
const PointerId = 73;
const Target = { Lower: 'lower', Upper: 'upper' } as const;
const Press = { Object: { x: 30, y: 30 }, Image: { x: 100, y: 100 } } as const;

let model: CanvasDocument;
let objects: AnnotationDocument;
let drawing: DrawingController;

beforeEach(() => {
	model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	model.create({ name: 'eraser-targets', ...Surface, transparent: true, background: ColorPalette.White });
	model.overlay.getBoundingClientRect = () => new DOMRect(0, 0, Surface.width, Surface.height);
	objects = new AnnotationDocument();
	drawing = new DrawingController(model, undefined, objects);
	objects.add(shape(Target.Lower, 20));
	objects.createLayer();
	objects.add(shape(Target.Upper, 120));
	drawing.select(PaintToolId.Eraser);
});

describe('eraser layer targeting from the pointer', () => {
	it('erases the image without manually selecting it after adding content layers', () => {
		const retained = structuredClone(objects.state);
		const rasterDepth = model.undoDepth;
		drag(Press.Image);
		expect(model.undoDepth).toBe(rasterDepth + 1);
		expect(objects.state).toEqual(retained);
		expect(objects.activeLayer).toBeNull();
		expect(model.layers.state.activeLayerId).toBe(CoreLayerId.Image);
	});

	it('finds a lower content layer even while another content layer is active', () => {
		const lowerLayer = objects.layerOf(Target.Lower)!.id;
		const rasterDepth = model.undoDepth;
		drag(Press.Object);
		expect(objects.object(Target.Lower)?.erasures).toHaveLength(1);
		expect(objects.object(Target.Upper)?.erasures).toBeUndefined();
		expect(objects.activeLayer?.id).toBe(lowerLayer);
		expect(model.undoDepth).toBe(rasterDepth);
	});

	it('keeps one target throughout a stroke crossing another layer and the image', () => {
		drag(Press.Object, { x: 130, y: 30 });
		expect(objects.object(Target.Lower)?.erasures).toHaveLength(1);
		expect(objects.object(Target.Upper)?.erasures).toBeUndefined();
		expect(model.canUndo).toBe(false);
	});

	it('keeps a stroke started on the image from erasing content layers it later crosses', () => {
		const retained = structuredClone(objects.state);
		drag(Press.Image, Press.Object);
		expect(objects.state).toEqual(retained);
		expect(model.canUndo).toBe(true);
	});

	it.each(['item', 'layer', 'objects'] as const)('respects a locked %s instead of erasing the image underneath', (locked) => {
		if (locked === 'item') objects.setLocked(Target.Lower, true);
		else if (locked === 'layer') objects.setLayerLocked(objects.layerOf(Target.Lower)!.id, true);
		else model.layers.setLocked(CoreLayerId.Objects, true);
		const rasterDepth = model.undoDepth;
		const objectDepth = objects.undoDepth;
		drag(Press.Object);
		expect(objects.object(Target.Lower)?.erasures).toBeUndefined();
		expect(model.undoDepth).toBe(rasterDepth);
		expect(objects.undoDepth).toBe(objectDepth);
	});

	it('ignores hidden content when deciding which visible layer is beneath the pointer', () => {
		objects.setLayerVisible(objects.layerOf(Target.Lower)!.id, false);
		drag(Press.Object);
		expect(objects.object(Target.Lower)?.erasures).toBeUndefined();
		expect(model.canUndo).toBe(true);
	});

	it('leaves a locked image unchanged when an unrelated object layer is active', () => {
		model.layers.setLocked(CoreLayerId.Image, true);
		drag(Press.Image);
		expect(model.canUndo).toBe(false);
		expect(objects.state.objects.every((item) => item.erasures === undefined)).toBe(true);
	});

	it('keeps erasure history and the selected layer content editable after .limg restoration', () => {
		drag(Press.Object);
		objects.undo();
		expect(objects.object(Target.Lower)?.erasures).toBeUndefined();
		objects.redo();
		const adapter = new ProjectEditorAdapter(model, objects);
		const codec = new ProjectCodec();
		const project = codec.parse(codec.serializeEditorState(adapter.capture()));
		const restored = new AnnotationDocument();
		restored.restoreSession(codec.toEditableObjects(project));
		expect(restored.object(Target.Lower)?.erasures).toEqual(objects.object(Target.Lower)?.erasures);
		expect(restored.state.layers).toEqual(objects.state.layers);
		restored.undo();
		expect(restored.object(Target.Lower)?.erasures).toBeUndefined();
	});

	it('can inspect locked visible hits without changing the existing editable hit-test contract', () => {
		objects.setLocked(Target.Lower, true);
		expect(objects.hitTest(Press.Object)).toBeNull();
		expect(objects.hitTest(Press.Object, undefined, AnnotationHitTestScope.Visible)?.id).toBe(Target.Lower);
	});
});

function shape(id: string, x: number): ShapeAnnotation {
	return {
		id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle,
		rect: { x, y: 20, width: 40, height: 40 }, color: ColorPalette.Black,
		width: 2, opacity: 1, fill: true,
	};
}

function drag(from: Point, to: Point = from): void {
	for (const [type, point] of [['pointerdown', from], ['pointermove', to], ['pointerup', to]] as const)
		model.overlay.dispatchEvent(new PointerEvent(type, {
			bubbles: true, button: 0, pointerId: PointerId, clientX: point.x, clientY: point.y,
		}));
}
