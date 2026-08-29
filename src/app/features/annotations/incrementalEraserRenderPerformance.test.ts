import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationRenderCache } from './annotationRenderCache';
import {
	AnnotationObjectTypeId,
	type ObjectErasurePath,
	type StrokeAnnotation,
} from './annotationTypes';

const CanvasDimension = 600;
const EraserSampleCount = 50;

afterEach(() => vi.restoreAllMocks());

describe('incremental eraser render performance', () => {
	it('rasterizes the paint layer once while an eraser path grows', () => {
		const contexts: CanvasRenderingContext2D[] = [];
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation(
			(tagName: string, options?: ElementCreationOptions) => {
				const created = createElement(tagName, options);
				if (created instanceof HTMLCanvasElement)
					contexts.push(completeContext(created.getContext('2d')!));
				return created;
			},
		);
		const cache = new AnnotationRenderCache();
		const target = completeContext(canvas().getContext('2d')!);
		const baseCanvas = canvas();
		const stroke = paintLayer();
		const erasure = erasurePath();
		const clearInteractive = vi.spyOn(contexts[1]!, 'clearRect');

		render(cache, target, baseCanvas, stroke, 1);
		stroke.erasures = [erasure];
		stroke.erasureRevision = 1;
		render(cache, target, baseCanvas, stroke, 2);
		for (let sample = 0; sample < EraserSampleCount; sample += 1) {
			erasure.points.push({
				xRatio: sample / EraserSampleCount,
				yRatio: sample / EraserSampleCount,
				pressure: 1,
			});
			stroke.erasureRevision += 1;
			render(cache, target, baseCanvas, stroke, sample + 3);
		}

		expect(clearInteractive).toHaveBeenCalledTimes(1);
	});
});

function render(
	cache: AnnotationRenderCache,
	target: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	stroke: StrokeAnnotation,
	revision: number,
): void {
	cache.render(
		target,
		baseCanvas,
		{ objects: [stroke], nextStep: 1 },
		{
			revision,
			staticRevision: 1,
			changedObjectId: stroke.id,
			interactionActive: true,
		},
		stroke,
		stroke,
	);
}

function paintLayer(): StrokeAnnotation {
	return {
		id: 'paint-layer',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: Array.from({ length: 2_000 }, (_, index) => ({
			x: 20 + (index % 400),
			y: 100 + Math.sin(index / 10) * 50,
			pressure: 1,
		})),
		pathStarts: [0],
		sourceRect: { x: 18, y: 48, width: 404, height: 104 },
		rect: { x: 18, y: 48, width: 404, height: 104 },
		color: '#008844',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
	};
}

function erasurePath(): ObjectErasurePath {
	const origin = { xRatio: 0, yRatio: 0, pressure: 1 };
	return {
		points: [origin, origin],
		sizeRatio: 0.05,
		opacity: 1,
		hardness: 1,
		strokePointLimit: 2_000,
	};
}

function canvas(): HTMLCanvasElement {
	const element = document.createElement('canvas');
	element.width = CanvasDimension;
	element.height = CanvasDimension;
	return element;
}

function completeContext(
	context: CanvasRenderingContext2D,
): CanvasRenderingContext2D {
	for (const method of ['strokeRect', 'arc', 'fillText', 'clip'] as const)
		if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
	return context;
}
