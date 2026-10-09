import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
} from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { BlendMode } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ContentLayer,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { DrawingController } from '../drawing/drawingController';
import { compositeLayer, compositeLayers, requiresImageBackdrop } from './layerCompositing';
import { LayerMerger } from './layerMerge';
import { LayersController } from './layersController';

type TestPoint = Readonly<{ x: number; y: number }>;

const Surface = { width: 200, height: 160 } as const;
const HALF_OPACITY = 0.5;
const QUARTER_TURN = 90;

function shape(id: string, x: number, y: number): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x, y, width: 30, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		rotation: 0,
	};
}

function layer(id: string, extra: Partial<ContentLayer> = {}): ContentLayer {
	return { id, name: id, itemIds: [], ...extra };
}

let model: CanvasDocument;
let objects: AnnotationDocument;
let drawing: DrawingController;
let overlay: HTMLCanvasElement;

beforeEach(() => {
	const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
	overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
	model = new CanvasDocument(canvas, overlay);
	model.create({ name: 'layer-containers', ...Surface, transparent: true, background: '#ffffff' });
	overlay.getBoundingClientRect = () =>
		({ left: 0, top: 0, right: Surface.width, bottom: Surface.height, x: 0, y: 0, ...Surface }) as DOMRect;
	objects = new AnnotationDocument();
	drawing = new DrawingController(model, undefined, objects);
});

describe('drawing into content layers', () => {
	it('makes every brush drag its own stroke item in the active layer', () => {
		drawing.select(PaintToolId.Brush);
		drag({ x: 20, y: 20 }, { x: 80, y: 40 });
		drag({ x: 20, y: 90 }, { x: 80, y: 110 });
		drawing.select(ShapeToolId.Rectangle);
		drag({ x: 120, y: 20 }, { x: 170, y: 60 });
		expect(objects.state.layers).toHaveLength(1);
		expect(objects.state.objects.map((item) => item.type)).toEqual([
			AnnotationObjectTypeId.Stroke,
			AnnotationObjectTypeId.Stroke,
			AnnotationObjectTypeId.Shape,
		]);
	});

	it('selects a whole layer from the canvas with Select, and a second click drills in to the item', () => {
		objects.add(shape('low', 20, 20));
		const lower = objects.activeLayer!.id;
		objects.createLayer();
		objects.add(shape('high', 120, 20));
		drawing.select(UtilityToolId.Select);
		drag({ x: 30, y: 30 }, { x: 40, y: 50 });
		expect(objects.selectedLayer?.id).toBe(lower);
		expect(objects.object('low')?.rect).toMatchObject({ x: 30, y: 40 });
		expect(objects.object('high')?.rect).toMatchObject({ x: 120, y: 20 });
		drag({ x: 40, y: 50 }, { x: 40, y: 50 });
		expect(objects.selectedId).toBe('low');
		expect(objects.selectedLayer).toBeNull();
	});

	it('starts Select at the layer of the item just drawn', () => {
		drawing.select(PaintToolId.Brush);
		drag({ x: 20, y: 20 }, { x: 80, y: 40 });
		drawing.select(UtilityToolId.Select);
		expect(objects.selectedId).toBeNull();
		expect(objects.selectedLayer?.id).toBe(objects.state.layers[0]?.id);
	});

	it('with an item selected, drags the neighbouring stroke under the pointer even inside the selected frame', () => {
		drawing.select(PaintToolId.Brush);
		drag({ x: 80, y: 60 }, { x: 80, y: 100 });
		const inner = objects.state.objects[0]!.id;
		path([{ x: 20, y: 20 }, { x: 180, y: 20 }, { x: 180, y: 140 }]);
		const outer = objects.state.objects[1]!.id;
		drawing.select(UtilityToolId.Select);
		objects.select(outer);
		const innerBefore = { ...objects.object(inner)!.rect };
		const outerBefore = { ...objects.object(outer)!.rect };
		drag({ x: 80, y: 80 }, { x: 90, y: 100 });
		expect(objects.selectedId).toBe(inner);
		expect(objects.object(inner)?.rect).toMatchObject({ x: innerBefore.x + 10, y: innerBefore.y + 20 });
		expect(objects.object(outer)?.rect).toEqual(outerBefore);
	});

	it('drags a whole selected layer, and a plain click inside it picks the item', () => {
		objects.add(shape('a', 20, 20));
		objects.add(shape('b', 100, 80));
		const layerId = objects.activeLayer!.id;
		drawing.select(UtilityToolId.Select);
		objects.selectLayer(layerId);
		drag({ x: 80, y: 60 }, { x: 90, y: 75 });
		expect(objects.object('a')?.rect).toMatchObject({ x: 30, y: 35 });
		expect(objects.object('b')?.rect).toMatchObject({ x: 110, y: 95 });
		expect(objects.selectedLayer?.id).toBe(layerId);
		drag({ x: 40, y: 45 }, { x: 40, y: 45 });
		expect(objects.selectedId).toBe('a');
	});

	it('resizes a whole selected layer from a corner, scaling every item with it', () => {
		objects.add(shape('a', 20, 20));
		objects.add(shape('b', 100, 80));
		const layerId = objects.activeLayer!.id;
		drawing.select(UtilityToolId.Select);
		objects.selectLayer(layerId);
		expect(objects.layerBounds(layerId)).toEqual({ x: 20, y: 20, width: 110, height: 80 });
		drag({ x: 130, y: 100 }, { x: 185, y: 140 });
		expect(objects.layerBounds(layerId)).toEqual({ x: 20, y: 20, width: 165, height: 120 });
		expect(objects.object('b')?.rect).toEqual({ x: 140, y: 110, width: 45, height: 30 });
		objects.undo();
		expect(objects.object('b')?.rect).toEqual({ x: 100, y: 80, width: 30, height: 20 });
	});

	it('rotates a whole selected layer around its centre from just outside its frame', () => {
		objects.add(shape('a', 20, 20));
		objects.add(shape('b', 100, 80));
		const layerId = objects.activeLayer!.id;
		drawing.select(UtilityToolId.Select);
		objects.selectLayer(layerId);
		path([{ x: 75, y: 10 }, { x: 110, y: 20 }, { x: 145, y: 60 }]);
		expect(objects.object('a')?.rotation).toBeCloseTo(QUARTER_TURN);
		expect(objects.object('b')?.rotation).toBeCloseTo(QUARTER_TURN);
		const center = { x: 75, y: 60 };
		const b = objects.object('b')!.rect;
		// b's centre sat 40 right and 30 below the layer centre; a quarter turn puts it 30 left and 40 below.
		expect(b.x + b.width / 2).toBeCloseTo(center.x - 30);
		expect(b.y + b.height / 2).toBeCloseTo(center.y + 40);
	});

	it('keeps a rotated layer frame turned with the layer, and resizes along its axes', () => {
		objects.add(shape('a', 20, 20));
		objects.add(shape('b', 100, 80));
		const layerId = objects.activeLayer!.id;
		drawing.select(UtilityToolId.Select);
		objects.selectLayer(layerId);
		path([{ x: 75, y: 10 }, { x: 110, y: 20 }, { x: 145, y: 60 }]);
		const turned = objects.layerFrame(layerId)!;
		expect(turned.rotation).toBeCloseTo(QUARTER_TURN);
		expect(turned.rect.width).toBeCloseTo(110);
		expect(turned.rect.height).toBeCloseTo(80);
		objects.undo();
		expect(objects.layer(layerId)?.rotation ?? 0).toBe(0);
		objects.redo();
		expect(objects.layer(layerId)?.rotation).toBeCloseTo(QUARTER_TURN);
	});

	it('erases across the active layer, adding erasure only to items it reaches', () => {
		objects.add(shape('touched', 20, 20));
		objects.add(shape('untouched', 140, 120));
		drawing.select(PaintToolId.Eraser);
		drag({ x: 10, y: 30 }, { x: 60, y: 30 });
		expect(objects.object('touched')?.erasures).toHaveLength(1);
		expect(objects.object('untouched')?.erasures).toBeUndefined();
		expect(objects.canUndo).toBe(true);
	});

	it('records nothing when the eraser misses every item', () => {
		objects.add(shape('far', 150, 120));
		const depth = objects.undoDepth;
		drawing.select(PaintToolId.Eraser);
		drag({ x: 5, y: 5 }, { x: 20, y: 5 });
		expect(objects.undoDepth).toBe(depth);
	});
});

describe('layer compositing by group', () => {
	it('draws visible layers bottom first, skipping hidden layers, hidden items and excluded items', () => {
		const target = document.createElement('canvas').getContext('2d')!;
		const drawn: string[] = [];
		compositeLayers(
			target,
			{
				objects: [shape('a', 0, 0), { ...shape('b', 0, 0), visible: false }, shape('c', 0, 0), shape('d', 0, 0)],
				layers: [
					layer('one', { itemIds: ['a', 'b'] }),
					layer('two', { itemIds: ['c'], visible: false }),
					layer('three', { itemIds: ['d'] }),
				],
				nextStep: 1,
			},
			(_context, item) => drawn.push(item.id),
			(item) => item.id !== 'd',
		);
		expect(drawn).toEqual(['a']);
	});

	it('isolates a layer with its own opacity and blend mode', () => {
		const target = document.createElement('canvas').getContext('2d')!;
		const composited: Array<readonly [number, string]> = [];
		vi.mocked(target.drawImage).mockImplementation(() => {
			composited.push([target.globalAlpha, target.globalCompositeOperation]);
		});
		target.globalAlpha = 1;
		const draw = vi.fn();
		compositeLayer(target, null, draw);
		expect(draw).toHaveBeenLastCalledWith(target);
		compositeLayer(target, layer('blended', { opacity: HALF_OPACITY, blendMode: BlendMode.Multiply }), draw);
		expect(composited).toEqual([[HALF_OPACITY, BlendMode.Multiply]]);
		expect(requiresImageBackdrop([layer('empty', { blendMode: BlendMode.Screen })])).toBe(false);
		expect(requiresImageBackdrop([layer('full', { blendMode: BlendMode.Screen, itemIds: ['x'] })])).toBe(true);
	});

	it('bakes a merge into one pixel item when a layer has its own appearance', () => {
		objects.add(shape('a', 20, 20));
		const lower = objects.activeLayer!.id;
		const upper = objects.createLayer();
		objects.add(shape('b', 60, 60));
		objects.setLayerAppearance(upper, { opacity: HALF_OPACITY });
		const merger = new LayerMerger(model, objects);
		expect(merger.canMergeDown(upper)).toBe(true);
		merger.mergeDown(upper);
		expect(objects.state.layers.map((entry) => entry.id)).toEqual([lower]);
		expect(objects.state.objects).toHaveLength(1);
	});
});

describe('the layer list', () => {
	it('lists each layer with its items, top first, and selects from either row', () => {
		const controller = new LayersController(model, objects);
		objects.add(shape('a', 20, 20));
		objects.add({ ...shape('b', 60, 60), shape: ShapeToolId.Line });
		const layerId = objects.activeLayer!.id;
		const list = controller.panel.list;
		expect(
			[...list.querySelectorAll('.layer-row')].map((row) => row.querySelector('.layer-name')?.textContent),
		).toEqual(['Layer 12 items', 'Line', 'Rectangle', 'Image']);
		list.querySelector<HTMLElement>('[data-object-id="a"] .layer-name')!.click();
		expect(objects.selectedId).toBe('a');
		list.querySelector<HTMLElement>(`[data-content-layer-id="${layerId}"] .layer-name`)!.click();
		expect(objects.selectedLayer?.id).toBe(layerId);
		list.querySelector<HTMLElement>('.layer-expand')!.click();
		expect(list.querySelectorAll('.layer-item-row')).toHaveLength(0);
	});
});

function drag(from: TestPoint, to: TestPoint): void {
	path([from, to]);
}

function path(points: readonly TestPoint[]): void {
	const last = points.at(-1)!;
	const events = [
		['pointerdown', points[0]!],
		...points.slice(1).map((point) => ['pointermove', point] as const),
		['pointerup', last],
	] as const;
	for (const [type, point] of events)
		overlay.dispatchEvent(
			new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y }),
		);
}
