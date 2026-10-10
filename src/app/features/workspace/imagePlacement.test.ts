import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CanvasViewportController, ImagePlacement } from './canvasViewportController';

const CanvasArea = { width: 600, height: 400 } as const;
const RULER_SIZE = 32;

function centredViewport(): { model: CanvasDocument; viewport: CanvasViewportController } {
	const wrap = document.querySelector<HTMLElement>('#canvasWrap')!;
	Object.defineProperty(wrap, 'clientWidth', { configurable: true, value: CanvasArea.width });
	Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: CanvasArea.height });
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	return { model, viewport: new CanvasViewportController(model, ImagePlacement.Center) };
}

describe('a centred image', () => {
	it('sits in the middle of the canvas area, and the rulers start where it starts', () => {
		const { model } = centredViewport();
		model.create({ name: 'small', width: 100, height: 60, transparent: true, background: '#fff' });
		const viewport = document.querySelector<HTMLElement>('.canvas-viewport')!;
		const spareWidth = (CanvasArea.width - 100 - RULER_SIZE) / 2;
		const spareHeight = (CanvasArea.height - 60 - RULER_SIZE) / 2;
		expect(viewport.style.marginLeft).toBe(`${spareWidth}px`);
		expect(viewport.style.marginTop).toBe(`${spareHeight}px`);
		expect(
			document.querySelector<HTMLElement>('.horizontal-ruler')!.style.getPropertyValue('--ruler-scroll'),
		).toBe(`${-spareWidth}px`);
	});

	it('is shown whole when it opens: a large one is zoomed out, a small one is not enlarged', () => {
		const { model, viewport } = centredViewport();
		model.create({ name: 'large', width: 2000, height: 1000, transparent: true, background: '#fff' });
		viewport.showWholeImage();
		expect(viewport.zoom).toBeLessThan(1);
		expect(model.width * viewport.zoom).toBeLessThanOrEqual(CanvasArea.width);
		model.create({ name: 'icon', width: 16, height: 16, transparent: true, background: '#fff' });
		viewport.showWholeImage();
		expect(viewport.zoom).toBe(1);
	});
});
