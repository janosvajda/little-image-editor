import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { LayersController } from './layersController';

describe('Layers toolbar contract', () => {
	it('uses a managed toolbar and controls the shared layer document', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'layers',
			width: 10,
			height: 10,
			transparent: true,
			background: '#ffffff',
		});
		const controller = new LayersController(model);

		expect(controller.panel.element.dataset.panel).toBe('layers');
		expect(controller.panel.list.querySelectorAll('.layer-row')).toHaveLength(
			2,
		);
		controller.panel.list
			.querySelector<HTMLButtonElement>(
				`[data-layer-id="${CoreLayerId.Image}"] .layer-visibility`,
			)!
			.click();
		expect(model.layers.isVisible(CoreLayerId.Image)).toBe(false);
		expect(model.canvas.style.opacity).toBe('0');
	});
});
