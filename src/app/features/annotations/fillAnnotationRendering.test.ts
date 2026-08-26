import { describe, expect, it, vi } from 'vitest';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { renderAnnotationObject } from './annotationRenderer';
import { AnnotationObjectTypeId } from './annotationTypes';

describe('retained fill rendering', () => {
	it('renders compact mask runs into resized fill bounds', () => {
		const context = {
			canvas: document.createElement('canvas'),
			save: vi.fn(),
			restore: vi.fn(),
			fillRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D;
		renderAnnotationObject(context, document.createElement('canvas'), {
			id: 'fill',
			type: AnnotationObjectTypeId.Fill,
			layerId: CoreLayerId.Objects,
			rect: { x: 10, y: 20, width: 8, height: 4 },
			runs: [
				{ x: 2, y: 3, length: 2 },
				{ x: 3, y: 4, length: 1 },
			],
			color: '#123456',
			opacity: 0.5,
			tolerance: 10,
		});
		expect(context.fillRect).toHaveBeenCalledTimes(2);
		expect(context.fillRect).toHaveBeenNthCalledWith(1, 10, 20, 8, 2);
	});
});
