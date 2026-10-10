import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { BlendMode } from '../../core/layers/layerTypes';
import { AnnotationDocument } from './annotationDocument';
import { AnnotationRenderCache } from './annotationRenderCache';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
	type StrokeAnnotation,
} from './annotationTypes';

const Surface = { width: 120, height: 80 } as const;

function shape(id: string): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 10, y: 10, width: 30, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
	};
}

function stroke(id: string): StrokeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Stroke,
		tool: PaintToolId.Brush,
		points: [
			{ x: 50, y: 40, pressure: 1 },
			{ x: 90, y: 60, pressure: 1 },
		],
		rect: { x: 48, y: 38, width: 44, height: 24 },
		color: '#000000',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
	};
}

beforeEach(() => {
	const createElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(
		(tagName: string, options?: ElementCreationOptions) => {
			const element = createElement(tagName, options);
			if (element instanceof HTMLCanvasElement) withCanvasMethods(element);
			return element;
		},
	);
});

afterEach(() => vi.restoreAllMocks());

describe('a newly drawn stroke and the render cache', () => {
	it('is drawn over the cache while drawn and joins it on commit without a rebuild', () => {
		const { cache, objects, render } = setup();
		objects.add(shape('kept'));
		render();
		const builds = cache.metrics.cacheBuilds;

		objects.add(stroke('new'), false);
		render(objects.object('new'));
		objects.commitCurrent();
		render();

		expect(cache.metrics.cacheBuilds).toBe(builds);
	});

	it('rebuilds after a committed stroke in a blended layer, keeping that layer isolated', () => {
		const { cache, objects, render } = setup();
		objects.add(shape('kept'));
		objects.setLayerAppearance(objects.activeLayer!.id, { blendMode: BlendMode.Multiply });
		render();
		const builds = cache.metrics.cacheBuilds;

		objects.add(stroke('new'), false);
		render(objects.object('new'));
		objects.commitCurrent();
		render();

		expect(cache.metrics.cacheBuilds).toBe(builds + 1);
	});

	it('rebuilds when the image backdrop changes', () => {
		const { cache, objects, render } = setup();
		objects.add(shape('kept'));
		render();
		const builds = cache.metrics.cacheBuilds;
		render(null, document.createElement('canvas'));
		expect(cache.metrics.cacheBuilds).toBe(builds + 1);
	});
});

function setup() {
	const cache = new AnnotationRenderCache();
	const objects = new AnnotationDocument();
	const target = withCanvasMethods(sized(document.createElement('canvas')));
	const base = sized(document.createElement('canvas'));
	const render = (
		interactive: ReturnType<AnnotationDocument['object']> = null,
		backdrop: HTMLCanvasElement | null = null,
	) =>
		cache.render(target, base, objects.state, objects.renderState, null, interactive, backdrop);
	return { cache, objects, render };
}

function sized(canvas: HTMLCanvasElement): HTMLCanvasElement {
	canvas.width = Surface.width;
	canvas.height = Surface.height;
	return canvas;
}

function withCanvasMethods(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const context = canvas.getContext('2d')!;
	for (const method of ['strokeRect', 'arc', 'fillText', 'clip'] as const)
		if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
	return context;
}
