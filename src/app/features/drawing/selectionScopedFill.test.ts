import { beforeEach, describe, expect, it } from 'vitest';
import { ShapeToolId, UtilityToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { framePixelTest } from '../../core/geometry/shapeTransformHelpers';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type FillAnnotation,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';
import { createFloodFillMask } from './floodFillHelpers';

const Surface = { width: 200, height: 120 } as const;
const FillOptions = { color: '#ff0000', opacity: 1, tolerance: 0 } as const;
const QUARTER_TURN = 90;

function shape(id: string, x: number, y: number): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x, y, width: 40, height: 30 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: false,
		rotation: 0,
	};
}

function fills(objects: AnnotationDocument): FillAnnotation[] {
	return objects.state.objects.filter(
		(item): item is FillAnnotation => item.type === AnnotationObjectTypeId.Fill,
	);
}

function covered(fill: FillAnnotation): number {
	return fill.runs.reduce((total, run) => total + run.length, 0);
}

let objects: AnnotationDocument;
let drawing: DrawingController;
let overlay: HTMLCanvasElement;

beforeEach(() => {
	const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
	overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
	const model = new CanvasDocument(canvas, overlay);
	model.create({ name: 'scoped-fill', ...Surface, transparent: true, background: '#ffffff' });
	overlay.getBoundingClientRect = () =>
		({ left: 0, top: 0, right: Surface.width, bottom: Surface.height, x: 0, y: 0, ...Surface }) as DOMRect;
	objects = new AnnotationDocument();
	drawing = new DrawingController(model, undefined, objects);
});

describe('flood fill regions', () => {
	it('never leaves its region, rotation included', () => {
		const surface = document.createElement('canvas');
		surface.width = Surface.width;
		surface.height = Surface.height;
		const frame = { rect: { x: 50, y: 20, width: 60, height: 20 }, rotation: QUARTER_TURN };
		const inFrame = framePixelTest(frame);
		const runs = createFloodFillMask(
			surface.getContext('2d')!,
			Surface.width,
			Surface.height,
			80,
			30,
			FillOptions,
			{ contains: inFrame },
		);
		const pixels = runs.flatMap((run) =>
			Array.from({ length: run.length }, (_, offset) => [run.x + offset, run.y] as const),
		);
		expect(pixels.length).toBeGreaterThan(0);
		expect(pixels.every(([x, y]) => inFrame(x, y))).toBe(true);
		expect(inFrame(75, 5)).toBe(true);
		expect(inFrame(55, 30)).toBe(false);
	});

	it('does nothing when started outside its region', () => {
		const surface = document.createElement('canvas');
		const runs = createFloodFillMask(
			surface.getContext('2d')!,
			Surface.width,
			Surface.height,
			5,
			5,
			FillOptions,
			{ contains: (x) => x > Surface.width / 2 },
		);
		expect(runs).toEqual([]);
	});
});

describe('the Fill tool keeps to the selection', () => {
	it('fills within a selected layer frame and keeps the fill beneath its lines', () => {
		objects.add(shape('a', 20, 20));
		objects.add(shape('b', 100, 60));
		const layerId = objects.activeLayer!.id;
		objects.selectLayer(layerId);
		drawing.select(UtilityToolId.Fill);
		expect(objects.selectedLayer?.id).toBe(layerId);

		click({ x: 5, y: 110 });
		expect(fills(objects)).toHaveLength(0);
		click({ x: 90, y: 40 });
		const [fill] = fills(objects);
		expect(fill?.rect).toEqual({ x: 20, y: 20, width: 120, height: 70 });
		expect(objects.layer(layerId)?.itemIds[0]).toBe(fill?.id);
		expect(objects.selectedLayer?.id).toBe(layerId);
	});

	it('fills within a selected item frame', () => {
		objects.add(shape('a', 20, 20));
		objects.add(shape('b', 100, 60));
		objects.select('a');
		drawing.select(UtilityToolId.Fill);
		click({ x: 30, y: 30 });
		const [fill] = fills(objects);
		expect(fill?.rect).toEqual({ x: 20, y: 20, width: 40, height: 30 });
		const layer = objects.layerOf('a')!;
		expect(layer.itemIds.indexOf(fill!.id)).toBe(layer.itemIds.indexOf('a') - 1);
	});

	it('fills everything reachable when nothing is selected', () => {
		drawing.select(UtilityToolId.Fill);
		click({ x: 10, y: 10 });
		const [fill] = fills(objects);
		expect(covered(fill!)).toBe(Surface.width * Surface.height);
	});
});

function click(point: Readonly<{ x: number; y: number }>): void {
	for (const type of ['pointerdown', 'pointerup'] as const)
		overlay.dispatchEvent(
			new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y }),
		);
}
