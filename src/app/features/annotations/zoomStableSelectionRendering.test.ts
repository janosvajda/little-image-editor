import { describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { renderAnnotationSelection } from './annotationRenderer';
import { AnnotationObjectTypeId } from './annotationTypes';

describe('zoom-stable selection rendering', () => {
	it('keeps handles and selection strokes constant in screen pixels at 400%', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 800;
		canvas.height = 600;
		canvas.getBoundingClientRect = () => new DOMRect(0, 0, 3200, 2400);
		const context = canvas.getContext('2d')!;
		renderAnnotationSelection(context, {
			id: 'shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Ellipse,
			rect: { x: 100, y: 100, width: 80, height: 60 },
			color: '#000000',
			width: 4,
			opacity: 1,
			fill: false,
		});

		expect(context.lineWidth).toBe(0.25);
		expect(context.setLineDash).toHaveBeenCalledWith([1.25, 1]);
		expect(context.fillRect).toHaveBeenCalledWith(
			expect.any(Number),
			expect.any(Number),
			2,
			2,
		);
	});
});
