import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CanvasViewportController } from './canvasViewportController';

describe('magnified canvas presentation', () => {
	it('uses the magnified rendering mode and sizes generic stage layers with the canvas', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const viewport = new CanvasViewportController(model);
		const vectorOverlay = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'svg',
		);
		viewport.addStageLayer(vectorOverlay);
		model.create({
			name: 'zoom-presentation',
			width: 200,
			height: 100,
			transparent: false,
			background: '#ffffff',
		});
		const zoom = document.querySelector<HTMLSelectElement>('#zoomSelect')!;
		zoom.value = '300';
		zoom.dispatchEvent(new Event('change'));

		expect(
			document.querySelector('.canvas-stage')!.classList.contains('magnified'),
		).toBe(true);
		expect(vectorOverlay.style.width).toBe('600px');
		expect(vectorOverlay.style.height).toBe('300px');
	});
});
