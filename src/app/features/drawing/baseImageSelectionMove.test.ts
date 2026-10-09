import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { BaseImageCropSelection } from './baseImageCropSelection';

const CanvasSize = 20;
const Selection = [
	{ x: 2, y: 2 },
	{ x: 10, y: 2 },
	{ x: 10, y: 10 },
	{ x: 2, y: 10 },
] as const;
const Inside = { x: 5, y: 5 } as const;
const MovedBy = { x: 4, y: 3 } as const;

/** jsdom has no Path2D; containment itself comes from the mocked context. */
class TestPath2D {
	moveTo(): void {}
	lineTo(): void {}
	closePath(): void {}
}

describe('image layer selection move', () => {
	let model: CanvasDocument;
	let rendered: Array<readonly unknown[] | null>;
	let selection: BaseImageCropSelection;

	beforeEach(() => {
		vi.stubGlobal('Path2D', TestPath2D);
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'selection',
			width: CanvasSize,
			height: CanvasSize,
			transparent: false,
			background: '#ffffff',
		});
		Object.assign(model.context, { isPointInPath: vi.fn(() => true) });
		rendered = [];
		selection = new BaseImageCropSelection(model, (points) =>
			rendered.push(points),
		);
		selection.select(Selection);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('moves selected pixels within the image as one history step', () => {
		const history = vi.fn();
		model.onHistoryChange(history);
		history.mockClear();
		const gesture = selection.begin(Inside)!;
		expect(gesture.locksScroll).toBe(true);
		gesture.update({ x: Inside.x + MovedBy.x, y: Inside.y + MovedBy.y }, 1);
		expect(model.context.drawImage).toHaveBeenCalled();
		gesture.complete({ x: Inside.x + MovedBy.x, y: Inside.y + MovedBy.y });

		expect(history).toHaveBeenCalledTimes(1);
		expect(rendered.at(-1)).toEqual(
			Selection.map(({ x, y }) => ({ x: x + MovedBy.x, y: y + MovedBy.y })),
		);
		expect(selection.contains(Inside)).toBe(true);
	});

	it('does not record a step for a gesture that ends where it started', () => {
		const history = vi.fn();
		model.onHistoryChange(history);
		history.mockClear();
		selection.begin(Inside)!.complete(Inside);
		expect(history).not.toHaveBeenCalled();
	});

	it('restores the image and selection when the move is cancelled', () => {
		const gesture = selection.begin(Inside)!;
		gesture.update({ x: Inside.x + MovedBy.x, y: Inside.y }, 1);
		gesture.cancel();
		expect(model.context.putImageData).toHaveBeenCalled();
		expect(rendered.at(-1)).toEqual(Selection.map((point) => ({ ...point })));
	});

	it('ignores points outside the selection or on a locked image layer', () => {
		vi.mocked(model.context.isPointInPath).mockReturnValueOnce(false);
		expect(selection.begin(Inside)).toBeNull();
		model.layers.setLocked(CoreLayerId.Image, true);
		expect(selection.contains(Inside)).toBe(false);
		expect(selection.begin(Inside)).toBeNull();
	});

	it('clears the selection when the image history or document changes', () => {
		model.commit();
		expect(rendered.at(-1)).toBeNull();
		expect(selection.contains(Inside)).toBe(false);
		selection.select(Selection);
		model.resize(CanvasSize * 2, CanvasSize * 2);
		expect(selection.contains(Inside)).toBe(false);
	});
});
