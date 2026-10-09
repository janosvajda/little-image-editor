import { describe, expect, it, vi } from 'vitest';
import { ShapeToolId, UtilityToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { isAnnotationSessionState } from '../annotations/annotationSerialization';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { CropSelectionOverlay } from './cropSelectionOverlay';
import { DrawingController } from './drawingController';
import { extractPixelFragment } from './pixelCutMove';
import { encodePixelBytes } from '../../shared/image/pixelDataCodec';

const RED_PIXEL = new Uint8ClampedArray([255, 0, 0, 255]);

describe('cut-and-move crop behavior', () => {
	it('uses a contrasting polygon frame and shades the unselected area', () => {
		const overlay = new CropSelectionOverlay();
		overlay.render(
			[
				{ x: 10, y: 20 },
				{ x: 130, y: 30 },
				{ x: 100, y: 100 },
			],
			200,
			150,
		);
		expect(overlay.element.querySelector('.crop-selection-shade')).not.toBeNull();
		expect(overlay.element.querySelector('.crop-selection-contrast')).not.toBeNull();
		expect(overlay.element.querySelector('.crop-selection-frame')).not.toBeNull();
	});

	it('extracts the exact pixels inside an arbitrary polygon', () => {
		const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
		const context = canvas.getContext('2d')!;
		canvas.width = 8;
		canvas.height = 8;
		const pixels = new Uint8ClampedArray(8 * 8 * 4);
		pixels.set(RED_PIXEL, (2 * 8 + 2) * 4);
		pixels.set(RED_PIXEL, (3 * 8 + 3) * 4);
		context.putImageData(new ImageData(pixels, 8, 8), 0, 0);
		const selectedPixels = new Uint8ClampedArray(3 * 3 * 4);
		selectedPixels.set(RED_PIXEL, (1 * 3 + 1) * 4);
		selectedPixels.set(RED_PIXEL, (2 * 3 + 2) * 4);
		vi.mocked(context.getImageData).mockReturnValueOnce(
			new ImageData(selectedPixels, 3, 3),
		);
		const fragment = extractPixelFragment(
				context,
				8,
				8,
				[
					{ x: 1, y: 1 },
					{ x: 4, y: 1 },
					{ x: 2, y: 4 },
				],
			);
		expect(fragment).not.toBeNull();
		expect(context.getImageData).toHaveBeenCalledWith(1, 1, 3, 3);
		const result = vi.mocked(context.putImageData).mock.lastCall;
		expect(result?.[1]).toBe(1);
		expect(result?.[2]).toBe(1);
		expect(result?.[0].data[(1 * 3 + 1) * 4 + 3]).toBe(0);
		expect(result?.[0].data[(2 * 3 + 2) * 4 + 3]).toBe(255);
		expect(fragment?.bounds).toEqual({ left: 1, top: 1, right: 4, bottom: 4, width: 3, height: 3 });
		expect([...fragment!.pixels.slice((1 * 3 + 1) * 4, (1 * 3 + 1) * 4 + 4)]).toEqual([...RED_PIXEL]);
		expect(fragment!.pixels[(2 * 3 + 2) * 4 + 3]).toBe(0);
		expect([canvas.width, canvas.height]).toEqual([8, 8]);
	});

	it('keeps a retained-layer cut editable and serializable', () => {
		const objects = new AnnotationDocument();
		objects.add({
			id: 'shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 20, y: 20, width: 80, height: 60 },
			color: '#000000',
			width: 2,
			opacity: 1,
			fill: true,
		});
		const fragmentId = objects.cutToRasterFragment(
			'shape',
			[
				{ x: 20, y: 20 },
				{ x: 60, y: 20 },
				{ x: 60, y: 80 },
				{ x: 20, y: 80 },
			],
			{
				id: 'fragment',
				type: AnnotationObjectTypeId.RasterFragment,
				rect: { x: 20, y: 20, width: 40, height: 60 },
				pixelWidth: 40,
				pixelHeight: 60,
				pixels: encodePixelBytes(new Uint8ClampedArray(40 * 60 * 4)),
				rotation: 0,
			},
		);
		expect(fragmentId).not.toBeNull();
		expect(objects.state.objects).toHaveLength(2);
		expect(objects.state.objects[0]?.pixelCutouts).toHaveLength(1);
		expect(objects.state.objects[1]).toMatchObject({
			id: fragmentId,
			type: AnnotationObjectTypeId.RasterFragment,
			rect: { x: 20, y: 20, width: 40, height: 60 },
		});
		expect(isAnnotationSessionState(objects.snapshotSession())).toBe(true);
	});

	it('selects pixels within a bare image layer without creating a retained layer', () => {
		const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
		const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
		const model = new CanvasDocument(canvas, overlay);
		model.create({ name: 'interactive-cut', width: 100, height: 80, transparent: true, background: '#fff' });
		overlay.getBoundingClientRect = () => domRect(100, 80);
		const objects = new AnnotationDocument();
		const drawing = new DrawingController(model, undefined, objects);
		drawing.select(UtilityToolId.Crop);
		const history = vi.fn();
		model.onHistoryChange(history);
		history.mockClear();
		pointer(overlay, 'pointerdown', 10, 10);
		pointer(overlay, 'pointermove', 30, 30);
		pointer(overlay, 'pointerup', 30, 30);
		expect([model.width, model.height]).toEqual([100, 80]);
		expect(objects.state.objects).toHaveLength(0);
		expect(objects.selected).toBeNull();
		expect(history).not.toHaveBeenCalled();
		expect(document.querySelector('[data-tool="crop"]')?.classList).toContain('active');
	});
});

function pointer(overlay: HTMLCanvasElement, type: string, x: number, y: number): void {
	overlay.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }) as PointerEvent);
}

function domRect(width: number, height: number): DOMRect {
	return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: vi.fn() };
}
