import { describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { renderAnnotationObject } from './annotationRenderer';
import { AnnotationObjectTypeId } from './annotationTypes';

describe('object erasure rendering isolation', () => {
	it('composites a masked object from an isolated surface onto the destination', () => {
		const destination = {
			canvas: Object.assign(document.createElement('canvas'), {
				width: 40,
				height: 40,
			}),
			drawImage: vi.fn(),
			stroke: vi.fn(),
			fill: vi.fn(),
		} as unknown as CanvasRenderingContext2D;
		const baseCanvas = document.createElement('canvas');
		baseCanvas.width = 40;
		baseCanvas.height = 40;

		renderAnnotationObject(destination, baseCanvas, {
			id: 'masked-shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 5, y: 5, width: 20, height: 20 },
			color: '#000000',
			width: 4,
			opacity: 1,
			fill: true,
			erasures: [
				{
					points: [
						{ xRatio: 0.25, yRatio: 0.5, pressure: 1 },
						{ xRatio: 0.75, yRatio: 0.5, pressure: 1 },
					],
					sizeRatio: 0.2,
					opacity: 1,
					hardness: 1,
				},
			],
		});

		expect(destination.drawImage).toHaveBeenCalledTimes(1);
		expect(destination.stroke).not.toHaveBeenCalled();
		expect(destination.fill).not.toHaveBeenCalled();
	});
});
