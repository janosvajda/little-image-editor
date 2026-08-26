import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationRenderCache } from './annotationRenderCache';
import { AnnotationObjectTypeId, type AnnotationObject } from './annotationTypes';

const CanvasSize = {
	Width: 1_200,
	Height: 800,
} as const;
const Fixture = {
	ObjectCount: 500,
	ObjectSize: 12,
	Columns: 25,
	Spacing: 20,
	MoveDistance: 7,
} as const;

beforeEach(() => {
	const createElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(
		(tagName: string, options?: ElementCreationOptions) => {
			const element = createElement(tagName, options);
			if (element instanceof HTMLCanvasElement) context(element);
			return element;
		},
	);
});

afterEach(() => vi.restoreAllMocks());

describe('annotation render cache performance contract', () => {
	it('renders unchanged objects once while an object is moved repeatedly', () => {
		const cache = new AnnotationRenderCache();
		const targetCanvas = canvas();
		const baseCanvas = canvas();
		const target = context(targetCanvas);
		const objects = annotationObjects();
		const interactive = objects.at(-1)!;

		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{ revision: 1, changedObjectId: null },
			null,
			null,
		);
		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{ revision: 1, changedObjectId: null },
			interactive,
			interactive,
		);
		move(interactive);
		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{ revision: 2, changedObjectId: interactive.id },
			interactive,
			interactive,
		);
		move(interactive);
		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{ revision: 3, changedObjectId: interactive.id },
			interactive,
			interactive,
		);

		expect(cache.metrics).toEqual({
			cacheBuilds: 2,
			cachedObjectsRendered:
				Fixture.ObjectCount + (Fixture.ObjectCount - 1),
			fullComposites: 2,
			dirtyComposites: 2,
		});
	});

	it('uses a full composite for rotation where a rectangular dirty region is unsafe', () => {
		const cache = new AnnotationRenderCache();
		const targetCanvas = canvas();
		const baseCanvas = canvas();
		const target = context(targetCanvas);
		const interactive = annotationObjects().at(-1)!;
		const objects = [interactive];

		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{ revision: 1, changedObjectId: null },
			interactive,
			interactive,
		);
		interactive.rotation = Math.PI / 4;
		cache.render(
			target,
			baseCanvas,
			{ objects, nextStep: 1 },
			{ revision: 2, changedObjectId: interactive.id },
			interactive,
			interactive,
		);

		expect(cache.metrics.fullComposites).toBe(2);
		expect(cache.metrics.dirtyComposites).toBe(0);
	});
});

function annotationObjects(): AnnotationObject[] {
	return Array.from({ length: Fixture.ObjectCount }, (_, index) => ({
		id: `box-${index}`,
		type: AnnotationObjectTypeId.Box,
		rect: {
			x: (index % Fixture.Columns) * Fixture.Spacing,
			y: Math.floor(index / Fixture.Columns) * Fixture.Spacing,
			width: Fixture.ObjectSize,
			height: Fixture.ObjectSize,
		},
		color: '#123456',
		width: 2,
		opacity: 1,
		blur: 0,
	}));
}

function move(object: AnnotationObject): void {
	if ('rect' in object && object.rect)
		object.rect.x += Fixture.MoveDistance;
}

function canvas(): HTMLCanvasElement {
	const element = document.createElement('canvas');
	element.width = CanvasSize.Width;
	element.height = CanvasSize.Height;
	return element;
}

function context(canvasElement: HTMLCanvasElement): CanvasRenderingContext2D {
	const drawingContext = canvasElement.getContext('2d')!;
	for (const method of ['strokeRect', 'arc', 'fillText', 'clip'] as const)
		if (!(method in drawingContext))
			Object.assign(drawingContext, { [method]: vi.fn() });
	return drawingContext;
}
