import { describe, expect, it, vi } from 'vitest';
import { AnnotationRenderCache } from './annotationRenderCache';
import { AnnotationObjectTypeId, type AnnotationObject } from './annotationTypes';

const CanvasDimension = 200;

describe('existing retained-object compositing order', () => {
	it('rebuilds canonical z-order after moving an existing cached object', () => {
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation(
			(tagName: string, options?: ElementCreationOptions) => {
				const created = createElement(tagName, options);
				if (created instanceof HTMLCanvasElement)
					completeContext(created.getContext('2d')!);
				return created;
			},
		);
		const cache = new AnnotationRenderCache();
		const targetCanvas = canvas();
		const baseCanvas = canvas();
		const target = targetCanvas.getContext('2d')!;
		for (const context of [target, baseCanvas.getContext('2d')!])
			completeContext(context);
		const objects = boxes();
		const moved = objects[0]!;

		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{
				revision: 1,
				staticRevision: 1,
				changedObjectId: null,
				interactionActive: false,
			},
			moved,
			null,
		);
		moved.rect.x += 10;
		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{
				revision: 2,
				staticRevision: 1,
				changedObjectId: moved.id,
				interactionActive: true,
			},
			moved,
			moved,
		);
		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{
				revision: 2,
				staticRevision: 2,
				changedObjectId: moved.id,
				interactionActive: false,
			},
			moved,
			null,
		);

		expect(cache.metrics.cacheBuilds).toBe(3);
		expect(cache.metrics.cachedObjectsRendered).toBe(5);
	});
});

function canvas(): HTMLCanvasElement {
	const element = document.createElement('canvas');
	element.width = CanvasDimension;
	element.height = CanvasDimension;
	completeContext(element.getContext('2d')!);
	return element;
}

function completeContext(context: CanvasRenderingContext2D): void {
	for (const method of ['strokeRect', 'arc', 'fillText', 'clip'] as const)
		if (!(method in context)) Object.assign(context, { [method]: () => undefined });
}

function boxes(): AnnotationObject[] {
	return ['#ff0000', '#0000ff'].map((color, index) => ({
		id: `box-${index}`,
		type: AnnotationObjectTypeId.Box,
		rect: { x: 30 + index * 20, y: 30, width: 80, height: 80 },
		color,
		width: 8,
		opacity: 1,
		blur: 0,
	}));
}
