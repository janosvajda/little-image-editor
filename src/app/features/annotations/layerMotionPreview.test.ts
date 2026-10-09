import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { BlendMode } from '../../core/layers/layerTypes';
import type { AnnotationRenderState, LayerMotion } from './annotationDocument';
import { AnnotationRenderCache } from './annotationRenderCache';
import {
	type AnnotationState,
	AnnotationObjectTypeId,
	type ContentLayer,
	type ShapeAnnotation,
} from './annotationTypes';

const CanvasSize = { width: 200, height: 120 } as const;
const CONTEXT_METHODS_MISSING_FROM_MOCK = ['strokeRect', 'arc', 'fillText', 'clip'] as const;

function shape(id: string, x: number): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x, y: 20, width: 30, height: 30 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		rotation: 0,
	};
}

function state(above: Partial<ContentLayer> = {}): AnnotationState {
	return {
		objects: [shape('low', 10), shape('moving', 60), shape('high', 110)],
		layers: [
			{ id: 'below', name: 'Below', itemIds: ['low'] },
			{ id: 'moving-layer', name: 'Moving', itemIds: ['moving'] },
			{ id: 'above', name: 'Above', itemIds: ['high'], ...above },
		],
		nextStep: 1,
	};
}

function frame(revision: number, layerMotion?: LayerMotion): AnnotationRenderState {
	return {
		revision,
		staticRevision: revision,
		changedObjectId: null,
		interactionActive: false,
		...(layerMotion ? { layerMotion } : {}),
	};
}

function sizedCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = CanvasSize.width;
	canvas.height = CanvasSize.height;
	return canvas;
}

let target: CanvasRenderingContext2D;
let base: HTMLCanvasElement;

beforeEach(() => {
	const createElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(
		(tagName: string, options?: ElementCreationOptions) => {
			const created = createElement(tagName, options);
			if (created instanceof HTMLCanvasElement) {
				const context = created.getContext('2d')!;
				for (const method of CONTEXT_METHODS_MISSING_FROM_MOCK)
					if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
			}
			return created;
		},
	);
	target = sizedCanvas().getContext('2d')!;
	base = sizedCanvas();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('whole-layer drag rendering', () => {
	it('draws the scene once per drag and shifts the layer by whole pixels', () => {
		const cache = new AnnotationRenderCache();
		const scene = state();
		cache.render(target, base, scene, frame(1, { layerId: 'moving-layer', offset: { x: 3.4, y: 1 } }), null, null);
		const shifted = vi.mocked(target.drawImage);
		shifted.mockClear();
		cache.render(target, base, scene, frame(2, { layerId: 'moving-layer', offset: { x: 13.9, y: 6.2 } }), null, null);
		cache.render(target, base, scene, frame(3, { layerId: 'moving-layer', offset: { x: 23.4, y: 11 } }), null, null);

		expect(cache.layerMotionBuilds).toBe(1);
		const layerShifts = shifted.mock.calls
			.map((call) => [call[1], call[2]])
			.filter(([x, y]) => x !== 0 || y !== 0);
		expect(layerShifts).toEqual([
			[14, 6],
			[23, 11],
		]);
		expect(layerShifts.flat().every(Number.isInteger)).toBe(true);
	});

	it('redraws everything once the drag ends, and prepares again for the next drag', () => {
		const cache = new AnnotationRenderCache();
		const scene = state();
		cache.render(target, base, scene, frame(1, { layerId: 'moving-layer', offset: { x: 5, y: 0 } }), null, null);
		const builds = cache.metrics.cacheBuilds;
		cache.render(target, base, scene, frame(2), null, null);
		expect(cache.metrics.cacheBuilds).toBe(builds + 1);
		cache.render(target, base, scene, frame(3, { layerId: 'moving-layer', offset: { x: 1, y: 0 } }), null, null);
		expect(cache.layerMotionBuilds).toBe(2);
	});

	it('redraws fully when a layer above blends, so the preview never differs from the result', () => {
		const cache = new AnnotationRenderCache();
		const scene = state({ blendMode: BlendMode.Multiply });
		cache.render(target, base, scene, frame(1, { layerId: 'moving-layer', offset: { x: 5, y: 0 } }), null, null);
		cache.render(target, base, scene, frame(2, { layerId: 'moving-layer', offset: { x: 9, y: 0 } }), null, null);
		expect(cache.layerMotionBuilds).toBe(0);
		expect(cache.metrics.cacheBuilds).toBe(2);
	});
});
