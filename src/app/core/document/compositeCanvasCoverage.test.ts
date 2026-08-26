import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from './imageDocument';

describe('CanvasDocument composite canvas', () => {
	it('renders the visible bitmap and retained renderers into one canvas', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'composite',
			width: 20,
			height: 10,
			transparent: false,
			background: '#ffffff',
		});
		const retainedRenderer = vi.fn();
		model.registerCompositeRenderer(retainedRenderer);

		const composite = model.compositeCanvas();
		expect([composite.width, composite.height]).toEqual([20, 10]);
		expect(composite.getContext('2d')?.drawImage).toHaveBeenCalledWith(
			model.canvas,
			0,
			0,
		);
		expect(retainedRenderer).toHaveBeenCalledOnce();
	});
});
