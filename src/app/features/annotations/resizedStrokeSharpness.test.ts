import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import type { AnnotationRenderState } from './annotationDocument';
import { AnnotationRenderCache } from './annotationRenderCache';
import type { StrokeAnnotation } from './annotationTypes';
import { createEmptyStroke } from './paintLayerFactory';

const CanvasSize = { width: 240, height: 160 } as const;
const CONTEXT_METHODS_MISSING_FROM_MOCK = ['strokeRect', 'arc', 'fillText', 'clip'] as const;
const LINE_WIDTH = 1;
const SCALED_DRAW_IMAGE_ARGUMENTS = 9;
const PLACED_DRAW_IMAGE_ARGUMENTS = 3;
const Source = { x: 10, y: 10, width: 60, height: 40 } as const;

const drawImageCalls: unknown[][] = [];
const lineWidths: number[] = [];

function stroke(rect: StrokeAnnotation['rect'], rotation = 0): StrokeAnnotation {
	return {
		...createEmptyStroke(),
		id: 'thin',
		tool: PaintToolId.Brush,
		points: [
			{ x: 11, y: 11, pressure: 1 },
			{ x: 69, y: 49, pressure: 1 },
		],
		pathStyles: [
			{ startIndex: 0, tool: PaintToolId.Brush, color: '#000000', size: LINE_WIDTH, opacity: 1, hardness: 1, seed: 1 },
		],
		size: LINE_WIDTH,
		sourceRect: { ...Source },
		rect,
		rotation,
	};
}

function committed(revision: number): AnnotationRenderState {
	return { revision, staticRevision: revision, changedObjectId: null, interactionActive: false };
}

function sizedCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = CanvasSize.width;
	canvas.height = CanvasSize.height;
	return canvas;
}

beforeEach(() => {
	drawImageCalls.length = 0;
	lineWidths.length = 0;
	const createElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(
		(tagName: string, options?: ElementCreationOptions) => {
			const created = createElement(tagName, options);
			if (created instanceof HTMLCanvasElement) {
				const context = created.getContext('2d')!;
				for (const method of CONTEXT_METHODS_MISSING_FROM_MOCK)
					if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
				vi.mocked(context.drawImage).mockImplementation((...args: unknown[]) => {
					drawImageCalls.push(args);
				});
				vi.mocked(context.stroke).mockImplementation(() => {
					lineWidths.push(context.lineWidth);
				});
			}
			return created;
		},
	);
});

afterEach(() => vi.restoreAllMocks());

describe('resized and rotated strokes stay sharp', () => {
	it.each([
		['enlarged', stroke({ x: 10, y: 10, width: 150, height: 100 })],
		['rotated', stroke({ ...Source }, 30)],
		['moved by part of a pixel', stroke({ ...Source, x: 10.5 })],
	])('draws an %s stroke from its points with its own line width', (_label, item) => {
		const cache = new AnnotationRenderCache();
		cache.render(sizedCanvas().getContext('2d')!, sizedCanvas(), { objects: [item], nextStep: 1 }, committed(1), null, null);
		expect(drawImageCalls.some((call) => call.length === SCALED_DRAW_IMAGE_ARGUMENTS)).toBe(false);
		const placed = drawImageCalls.filter((call) => call.length === PLACED_DRAW_IMAGE_ARGUMENTS);
		expect(placed.every(([, x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true);
		expect(lineWidths.length).toBeGreaterThan(0);
		expect(lineWidths.every((width) => width <= LINE_WIDTH)).toBe(true);
	});
});
