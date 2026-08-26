import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationRenderCache } from './annotationRenderCache';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from './annotationTypes';

const CanvasDimension = 600;
const MoveFrames = 40;
const PointCount = 2_000;

afterEach(() => vi.restoreAllMocks());

describe('transformed stroke bitmap reuse', () => {
	it('rasterizes a complex stroke once while it moves across many frames', () => {
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
		const stroke = complexStroke();
		const clearInteractive = vi.spyOn(contexts[1]!, 'clearRect');

		render(cache, target, baseCanvas, stroke, 1);
		for (let frame = 1; frame <= MoveFrames; frame += 1) {
			stroke.rect.x += 1;
			render(cache, target, baseCanvas, stroke, frame + 1);
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

function complexStroke(): StrokeAnnotation {
	return {
		id: 'complex-moving-stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: Array.from({ length: PointCount }, (_, index) => ({
			x: 20 + (index % 400),
			y: 100 + Math.sin(index / 10) * 50,
			pressure: 1,
		})),
		sourceRect: { x: 18, y: 48, width: 404, height: 104 },
		rect: { x: 18, y: 48, width: 404, height: 104 },
		color: '#008844',
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
