import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { SelectionOverlayRenderer } from './selectionOverlayRenderer';
import { AnnotationObjectTypeId } from './annotationTypes';

describe('zoom-independent selection overlay', () => {
	it('keeps its controls constant-sized while the document is magnified', () => {
		const renderer = new SelectionOverlayRenderer();
		renderer.render(
			{
				id: 'shape',
				type: AnnotationObjectTypeId.Shape,
				shape: ShapeToolId.Rectangle,
				rect: { x: 20, y: 30, width: 80, height: 60 },
				rotation: 0,
				color: '#000000',
				width: 2,
				opacity: 1,
				fill: false,
			},
			200,
			140,
			1 / 4,
		);

		expect(renderer.element.getAttribute('viewBox')).toBe('0 0 200 140');
		expect(
			Number(
				renderer.element
					.querySelector<SVGRectElement>('.selection-handle')!
					.getAttribute('width'),
			),
		).toBe(2);
	});
});
