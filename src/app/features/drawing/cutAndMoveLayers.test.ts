import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId, type Point } from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId, LayerKind } from '../../core/layers/layerTypes';
import { EditorHistory, HistoryDomain } from '../../core/history/editorHistory';
import { AnnotationDocument, AnnotationHitTestScope, LinkedHistoryDirection } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, LinkedHistoryDomain, type ShapeAnnotation, type StrokeAnnotation } from '../annotations/annotationTypes';
import { createObjectPixelMask } from '../annotations/objectErasures';
import { CropTool } from './cropTool';
import { CropSelectionKind } from './cropSelectionTypes';
import { drawingLayerTargetAt } from './drawingLayerTarget';
import { extractPixelFragment } from './pixelCutMove';

const Surface = { width: 160, height: 120 } as const;
const Selection = { from: { x: 25, y: 25 }, to: { x: 55, y: 55 } } as const;
const ObjectId = { Lower: 'lower', Upper: 'upper' } as const;

let model: CanvasDocument;
let objects: AnnotationDocument;
let crop: CropTool;

beforeEach(() => {
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'cut-and-move', ...Surface, transparent: false, background: ColorPalette.White });
	objects = new AnnotationDocument();
	crop = new CropTool(model, objects);
});

describe('cut and move source ownership', () => {
	it('cuts photo pixels into their own layer as one linked undoable action', () => {
		const history = new EditorHistory({ [HistoryDomain.Document]: model, [HistoryDomain.Objects]: objects });
		objects.onLinkedHistoryAction((_domain, direction) => direction === LinkedHistoryDirection.Undo ? model.undo() : model.redo());
		cut(Selection.from, Selection.to);
		expect(objects.state.layers).toHaveLength(1);
		expect(objects.selected).toMatchObject({ type: AnnotationObjectTypeId.RasterFragment, rect: { x: 25, y: 25, width: 30, height: 30 } });
		expect(objects.snapshotSession().historyLinks?.at(-1)).toBe(LinkedHistoryDomain.Document);
		expect([model.width, model.height]).toEqual([Surface.width, Surface.height]);
		history.undo();
		expect(objects.state.objects).toHaveLength(0);
		expect(model.canUndo).toBe(false);
		history.redo();
		expect(objects.state.objects).toHaveLength(1);
		expect(model.canUndo).toBe(true);
	});

	it('places a photo cut immediately above the image while retaining unrelated content layers', () => {
		objects.add(shape(ObjectId.Upper, 100));
		const retainedLayer = objects.activeLayer!.id;
		cut(Selection.from, Selection.to);
		expect(objects.state.layers).toHaveLength(2);
		expect(objects.state.layers[1]?.id).toBe(retainedLayer);
		expect(objects.state.layers[0]?.itemIds).toEqual([objects.selectedId]);
		expect(objects.object(ObjectId.Upper)?.pixelCutouts).toBeUndefined();
	});

	it('keeps a cut from an object inside its original layer', () => {
		objects.add(shape(ObjectId.Lower, 20));
		const layerId = objects.activeLayer!.id;
		cut(Selection.from, Selection.to);
		expect(objects.state.layers).toHaveLength(1);
		expect(objects.layerOf(objects.selectedId!)?.id).toBe(layerId);
		expect(objects.object(ObjectId.Lower)?.pixelCutouts).toHaveLength(1);
		expect(model.layers.state.activeLayerId).toBe(CoreLayerId.Objects);
		expect(model.canUndo).toBe(false);
	});

	it('holds the initial source even if selection changes during the draft', () => {
		objects.add(shape(ObjectId.Lower, 20));
		objects.createLayer();
		objects.add(shape(ObjectId.Upper, 100));
		const gesture = crop.begin(Selection.from, CropSelectionKind.Rectangle);
		objects.select(ObjectId.Upper);
		gesture.complete(Selection.to);
		expect(objects.object(ObjectId.Lower)?.pixelCutouts).toHaveLength(1);
		expect(objects.object(ObjectId.Upper)?.pixelCutouts).toBeUndefined();
	});

	it('does not cut an overlapping object when the selection started on the photo', () => {
		objects.add(shape(ObjectId.Upper, 40));
		cut({ x: 5, y: 5 }, { x: 100, y: 80 });
		expect(objects.object(ObjectId.Upper)?.pixelCutouts).toBeUndefined();
		expect(objects.state.layers).toHaveLength(2);
		expect(model.canUndo).toBe(true);
	});

	it('prefers an explicitly selected overlapping object only when the press reaches it', () => {
		objects.add(shape(ObjectId.Lower, 20));
		objects.add(shape(ObjectId.Upper, 20));
		expect(drawingLayerTargetAt(model, objects, Selection.from, ObjectId.Lower)).toMatchObject({ kind: LayerKind.Objects, objectId: ObjectId.Lower });
		expect(drawingLayerTargetAt(model, objects, { x: 5, y: 5 }, ObjectId.Lower)).toEqual({ kind: LayerKind.Raster, layerId: CoreLayerId.Image });
	});

	it('targets the photo through cut holes after an object is rotated and moved', () => {
		const source = shape(ObjectId.Lower, 20);
		source.rotation = 90;
		source.pixelCutouts = [createObjectPixelMask(genericShape(source).geometry, [
			{ x: 25, y: 25 }, { x: 45, y: 25 }, { x: 45, y: 45 }, { x: 25, y: 45 },
		])];
		objects.add(source);
		objects.move(source.id, { x: 60, y: 0 });
		const hole = { x: 95, y: 35 };
		expect(objects.hitTest(hole)?.id).toBe(source.id);
		expect(objects.containsObjectPoint(source.id, hole, AnnotationHitTestScope.Visible)).toBe(false);
		expect(drawingLayerTargetAt(model, objects, hole, source.id)?.kind).toBe(LayerKind.Raster);
		expect(drawingLayerTargetAt(model, objects, { x: 120, y: 60 })?.kind).toBe(LayerKind.Objects);
	});

	it('recognizes new stroke segments painted over a previous cut hole', () => {
		const source: StrokeAnnotation = {
			id: ObjectId.Lower, type: AnnotationObjectTypeId.Stroke, layerId: CoreLayerId.Objects,
			tool: PaintToolId.Brush, color: ColorPalette.Black, size: 4, opacity: 1, hardness: 1, seed: 1,
			points: [{ x: 20, y: 40, pressure: 1 }, { x: 80, y: 40, pressure: 1 }],
			rect: { x: 18, y: 38, width: 64, height: 4 }, sourceRect: { x: 18, y: 38, width: 64, height: 4 },
		};
		const mask = createObjectPixelMask(genericShape(source).geometry, [
			{ x: 40, y: 30 }, { x: 60, y: 30 }, { x: 60, y: 50 }, { x: 40, y: 50 },
		]);
		mask.strokePointLimit = source.points.length;
		mask.strokeSourceRect = { ...source.sourceRect! };
		source.pixelCutouts = [mask];
		objects.add(source);
		expect(drawingLayerTargetAt(model, objects, { x: 50, y: 40 })?.kind).toBe(LayerKind.Raster);
		objects.update(source.id, (item) => {
			if (item.type !== AnnotationObjectTypeId.Stroke) throw new Error('Expected stroke source.');
			item.pathStarts = [2];
			item.points.push({ x: 50, y: 20, pressure: 1 }, { x: 50, y: 70, pressure: 1 });
			item.rect = { x: 18, y: 18, width: 64, height: 54 };
			item.sourceRect = { ...item.rect };
		});
		expect(drawingLayerTargetAt(model, objects, { x: 50, y: 40 })?.kind).toBe(LayerKind.Objects);
		expect(drawingLayerTargetAt(model, objects, { x: 40, y: 40 })?.kind).toBe(LayerKind.Raster);
	});

	it.each(['image', 'object', 'layer', 'objects'] as const)('does not cut a locked %s or fall through to another source', (locked) => {
		if (locked === 'image') model.layers.setLocked(CoreLayerId.Image, true);
		else {
			objects.add(shape(ObjectId.Lower, 20));
			if (locked === 'object') objects.setLocked(ObjectId.Lower, true);
			else if (locked === 'layer') objects.setLayerLocked(objects.activeLayer!.id, true);
			else model.layers.setLocked(CoreLayerId.Objects, true);
		}
		const state = objects.snapshotSession();
		const depth = model.undoDepth;
		cut(Selection.from, Selection.to);
		expect(objects.snapshotSession()).toEqual(state);
		expect(model.undoDepth).toBe(depth);
	});

	it('rechecks a source locked after the selection starts', () => {
		objects.add(shape(ObjectId.Lower, 20));
		const gesture = crop.begin(Selection.from, CropSelectionKind.Rectangle);
		objects.setLocked(ObjectId.Lower, true);
		gesture.complete(Selection.to);
		expect(objects.state.objects).toHaveLength(1);
		expect(objects.object(ObjectId.Lower)?.pixelCutouts).toBeUndefined();
	});

	it('cancels a draft without cutting pixels, creating a layer or losing the prior selection', () => {
		objects.add(shape(ObjectId.Upper, 100));
		const state = objects.snapshotSession();
		const selected = objects.selectedId;
		const gesture = crop.begin(Selection.from, CropSelectionKind.Rectangle);
		gesture.update(Selection.to, 1);
		gesture.cancel();
		gesture.complete(Selection.to);
		expect(objects.snapshotSession()).toEqual(state);
		expect(objects.selectedId).toBe(selected);
		expect(model.canUndo).toBe(false);
	});

	it('creates nothing for an empty transparent source or a click without an area', () => {
		model.create({ name: 'empty', ...Surface, transparent: true, background: ColorPalette.White });
		cut(Selection.from, Selection.to);
		cut(Selection.from, Selection.from);
		expect(objects.state.layers).toHaveLength(0);
		expect(model.canUndo).toBe(false);
	});

	it('ignores selections entirely outside the canvas without reading pixels', () => {
		const context = document.createElement('canvas').getContext('2d')!;
		vi.mocked(context.getImageData).mockClear();
		expect(extractPixelFragment(context, Surface.width, Surface.height, [
			{ x: 200, y: 200 }, { x: 240, y: 200 }, { x: 240, y: 240 },
		])).toBeNull();
		expect(context.getImageData).not.toHaveBeenCalled();
	});
});

function shape(id: string, x: number): ShapeAnnotation {
	return { id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x, y: 20, width: 60, height: 60 }, color: ColorPalette.Black, width: 2, opacity: 1, fill: true };
}

function cut(from: Point, to: Point): void {
	const gesture = crop.begin(from, CropSelectionKind.Rectangle);
	gesture.update(to, 1);
	gesture.complete(to);
}
