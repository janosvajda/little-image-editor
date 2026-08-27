import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { renderAnnotationSelection } from './annotationRenderer';
import { AnnotationObjectTypeId } from './annotationTypes';

interface SelectionStroke {
	readonly color: string;
	readonly width: number;
}

describe('high-contrast selection outline', () => {
	it('draws a light underlay beneath the blue selection stroke', () => {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;
		const strokes: SelectionStroke[] = [];
		context.stroke = () => {
			strokes.push({
				color: String(context.strokeStyle),
				width: context.lineWidth,
			});
		};

		renderAnnotationSelection(context, {
			id: 'dark-object',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 10, y: 10, width: 40, height: 30 },
			color: ColorPalette.Black,
			width: 4,
			opacity: 1,
			fill: true,
		});

		expect(strokes[0]).toEqual({ color: ColorPalette.White, width: 3 });
		expect(strokes[1]).toEqual({ color: ColorPalette.Selection, width: 1 });
	});
});
