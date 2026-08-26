import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationRenderCache } from './annotationRenderCache';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from './annotationTypes';

const CanvasDimension = 200;

afterEach(() => vi.restoreAllMocks());

describe('transformed stroke continuation cache', () => {
	it('rebuilds once at the materialized position before incremental rendering', () => {
		const contexts: CanvasRenderingContext2D[] = [];
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation(
			(tagName: string, options?: ElementCreationOptions) => {
				const created = createElement(tagName, options);
				if (created instanceof HTMLCanvasElement) {
					const drawingContext = completeContext(created.getContext('2d')!);
					contexts.push(drawingContext);
				}
				return created;
			},
		);
		const cache = new AnnotationRenderCache();
		const targetCanvas = canvas();
		const baseCanvas = canvas();
		const target = completeContext(targetCanvas.getContext('2d')!);
		const stroke = editableStroke();
		const interactiveContext = contexts[1]!;
		const clearInteractive = vi.spyOn(interactiveContext, 'clearRect');

		render(cache, target, baseCanvas, stroke, 1);
		stroke.rect.x += 50;
		render(cache, target, baseCanvas, stroke, 2);
		stroke.points = stroke.points.map((point) => ({
			...point,
			x: point.x + 50,
		}));
		stroke.sourceRect = { ...stroke.rect };
		stroke.points.push({ x: 100, y: 40, pressure: 1 });
		render(cache, target, baseCanvas, stroke, 3);

		expect(clearInteractive).toHaveBeenCalledTimes(2);
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

function editableStroke(): StrokeAnnotation {
	return {
		id: 'continued-stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 10, y: 20, pressure: 1 },
			{ x: 50, y: 20, pressure: 1 },
		],
		sourceRect: { x: 8, y: 18, width: 44, height: 4 },
		rect: { x: 8, y: 18, width: 44, height: 4 },
		color: '#000000',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
		rotation: 0,
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
