import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { EditorLimit } from '../../core/document/editorLimits';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { encodePixelBytes } from '../../shared/image/pixelDataCodec';
import { renderAnnotationObject } from './annotationRenderer';
import {
	AnnotationObjectTypeId,
	type ObjectPixelMask,
	type RasterFragmentAnnotation,
	type ShapeAnnotation,
	type StrokeAnnotation,
} from './annotationTypes';

const CanvasSize = 40;
const OPAQUE_RED = [255, 0, 0, 255];
const Mask: ObjectPixelMask = {
	points: [
		{ xRatio: 0, yRatio: 0 },
		{ xRatio: 1, yRatio: 0 },
		{ xRatio: 1, yRatio: 1 },
	],
};

function stroke(extra: Partial<StrokeAnnotation> = {}): StrokeAnnotation {
	return {
		id: 'stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 4, y: 4, pressure: 1 },
			{ x: 12, y: 12, pressure: 1 },
			{ x: 20, y: 8, pressure: 1 },
		],
		rect: { x: 2, y: 2, width: 20, height: 12 },
		sourceRect: { x: 2, y: 2, width: 20, height: 12 },
		color: '#000000',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
		...extra,
	};
}

function shape(extra: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id: 'shape',
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 4, y: 4, width: 10, height: 10 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		...extra,
	};
}

function fragment(id: string): RasterFragmentAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.RasterFragment,
		rect: { x: 1, y: 1, width: 2, height: 1 },
		pixelWidth: 1,
		pixelHeight: 1,
		pixels: encodePixelBytes(Uint8ClampedArray.from(OPAQUE_RED)),
		rotation: 0,
	};
}

describe('annotation renderer layer content', () => {
	let target: CanvasRenderingContext2D;
	let base: HTMLCanvasElement;

	beforeEach(() => {
		const canvas = document.createElement('canvas');
		canvas.width = CanvasSize;
		canvas.height = CanvasSize;
		target = canvas.getContext('2d')!;
		base = document.createElement('canvas');
	});

	it('replays erasures and cut-outs in stroke order', () => {
		const erased = stroke({
			erasures: [
				{
					points: [{ xRatio: 0.5, yRatio: 0.5, pressure: 1 }],
					sizeRatio: 0.2,
					opacity: 1,
					hardness: 1,
					strokePointLimit: 2,
				},
			],
			pixelCutouts: [
				{ ...Mask, strokePointLimit: 3, strokeSourceRect: { x: 2, y: 2, width: 20, height: 12 } },
				{ ...Mask, strokePointLimit: 1 },
			],
		});
		renderAnnotationObject(target, base, erased);
		const surface = maskedSurface();
		expect(surface.fill).toHaveBeenCalled();
		expect(surface.lineTo).toHaveBeenCalled();
	});

	it('cuts out and clips shape pixels with their masks', () => {
		renderAnnotationObject(
			target,
			base,
			shape({ pixelCutouts: [Mask, { points: [] }], pixelClips: [Mask] }),
		);
		const surface = maskedSurface();
		const fills = vi.mocked(surface.fill).mock.calls.length;
		expect(fills).toBeGreaterThanOrEqual(Mask.points.length - 1);
	});

	it('draws raster layers from a bounded decoded cache', () => {
		const createElement = vi.spyOn(document, 'createElement');
		renderAnnotationObject(target, base, fragment('reused'));
		const created = createElement.mock.calls.length;
		renderAnnotationObject(target, base, fragment('reused'));
		expect(createElement.mock.calls.length).toBe(created);
		expect(target.drawImage).toHaveBeenLastCalledWith(expect.anything(), 1, 1, 2, 1);

		for (let index = 0; index <= EditorLimit.RasterLayerRenderCache; index += 1)
			renderAnnotationObject(target, base, fragment(`layer-${index}`));
		createElement.mockClear();
		renderAnnotationObject(target, base, fragment('reused'));
		expect(createElement).toHaveBeenCalledWith('canvas');
		createElement.mockRestore();
	});

	it('skips strokes with too few points to draw', () => {
		const drawCalls = vi.mocked(target.stroke).mock.calls.length;
		renderAnnotationObject(target, base, stroke({ points: [{ x: 1, y: 1, pressure: 1 }] }));
		expect(vi.mocked(target.stroke).mock.calls.length).toBe(drawCalls);
	});

	/** Masked layers are composed on an isolated surface, then drawn onto the target. */
	function maskedSurface(): CanvasRenderingContext2D {
		const source = vi.mocked(target.drawImage).mock.lastCall?.[0];
		expect(source).toBeInstanceOf(HTMLCanvasElement);
		return (source as HTMLCanvasElement).getContext('2d')!;
	}
});
