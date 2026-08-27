import { describe, expect, it, vi } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationRenderCache } from './annotationRenderCache';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from './annotationTypes';

const CanvasSize = {
	Width: 800,
	Height: 600,
} as const;
const StrokeFixture = {
	InitialPoints: 100,
	AdditionalPoints: 100,
	Size: 12,
	Move: 40,
} as const;

describe('complex retained stroke render performance', () => {
	it('renders only new brush segments and reuses the raster while moving', () => {
		const createdCanvases: HTMLCanvasElement[] = [];
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation(
			(tagName: string, options?: ElementCreationOptions) => {
				const created = createElement(tagName, options);
				if (created instanceof HTMLCanvasElement) {
					createdCanvases.push(created);
					completeContext(created.getContext('2d')!);
				}
				return created;
			},
		);
		const cache = new AnnotationRenderCache();
		const targetCanvas = sizedCanvas();
		const baseCanvas = sizedCanvas();
		const target = targetCanvas.getContext('2d')!;
		const stroke = createStroke(StrokeFixture.InitialPoints);

		cache.render(
			target,
			baseCanvas,
			{ objects: [stroke], nextStep: 1 },
			{
				revision: 1,
				staticRevision: 0,
				changedObjectId: stroke.id,
				interactionActive: true,
			},
			stroke,
			stroke,
		);
		const interactiveContext = createdCanvases[1]!.getContext('2d')!;
		expect(interactiveContext.lineTo).toHaveBeenCalledTimes(
			StrokeFixture.InitialPoints - 1,
		);

		stroke.points.push(
			...points(
				StrokeFixture.AdditionalPoints,
				StrokeFixture.InitialPoints,
			),
		);
		cache.render(
			target,
			baseCanvas,
			{ objects: [stroke], nextStep: 1 },
			{
				revision: 200,
				staticRevision: 0,
				changedObjectId: stroke.id,
				interactionActive: true,
			},
			stroke,
			stroke,
		);
		expect(interactiveContext.lineTo).toHaveBeenCalledTimes(
			StrokeFixture.InitialPoints + StrokeFixture.AdditionalPoints - 1,
		);

		stroke.rect = { ...stroke.rect, x: stroke.rect.x + StrokeFixture.Move };
		cache.render(
			target,
			baseCanvas,
			{ objects: [stroke], nextStep: 1 },
			{
				revision: 400,
				staticRevision: 0,
				changedObjectId: stroke.id,
				interactionActive: true,
			},
			stroke,
			stroke,
		);
		expect(interactiveContext.lineTo).toHaveBeenCalledTimes(
			StrokeFixture.InitialPoints + StrokeFixture.AdditionalPoints - 1,
		);
	});
});

function sizedCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = CanvasSize.Width;
	canvas.height = CanvasSize.Height;
	return canvas;
}

function completeContext(context: CanvasRenderingContext2D): void {
	for (const method of ['strokeRect', 'arc', 'fillText', 'clip'] as const)
		if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
}

function createStroke(pointCount: number): StrokeAnnotation {
	const sourceRect = {
		x: 20,
		y: 20,
		width: 300,
		height: 120,
	};
	return {
		id: 'complex-stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: points(pointCount),
		sourceRect,
		rect: { ...sourceRect },
		color: '#c44545',
		size: StrokeFixture.Size,
		opacity: 1,
		hardness: 1,
		seed: 1,
		rotation: 0,
	};
}

function points(count: number, offset = 0) {
	return Array.from({ length: count }, (_, index) => ({
		x: 20 + offset + index,
		y: 40 + ((offset + index) % 30),
		pressure: 1,
	}));
}
