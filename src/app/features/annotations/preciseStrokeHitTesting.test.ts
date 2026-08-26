import { describe, expect, it } from 'vitest';
import { PaintToolId, type Point } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from './annotationDocument';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from './annotationTypes';

const StrokeStyle = {
	color: '#000000',
	size: 4,
	opacity: 1,
	hardness: 1,
	seed: 1,
	rotation: 0,
} as const;

describe('precise paint-stroke hit testing', () => {
	it('selects visible stroke pixels instead of a higher empty bounding box', () => {
		const objects = new AnnotationDocument();
		objects.add(stroke('moved', { x: 0, y: 0 }, { x: 20, y: 0 }));
		objects.move('moved', { x: 40, y: 50 });
		const coveringBox = stroke(
			'covering-box',
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
		);
		coveringBox.points.push({ x: 100, y: 100, pressure: 1 });
		coveringBox.sourceRect = { x: -2, y: -2, width: 104, height: 104 };
		coveringBox.rect = { ...coveringBox.sourceRect };
		objects.add(coveringBox);

		expect(objects.hitTest({ x: 50, y: 50 })?.id).toBe('moved');
	});
});

function stroke(id: string, from: Point, to: Point): StrokeAnnotation {
	const padding = StrokeStyle.size / 2;
	const left = Math.min(from.x, to.x) - padding;
	const top = Math.min(from.y, to.y) - padding;
	const rect = {
		x: left,
		y: top,
		width: Math.abs(to.x - from.x) + StrokeStyle.size,
		height: Math.abs(to.y - from.y) + StrokeStyle.size,
	};
	return {
		id,
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ ...from, pressure: 1 },
			{ ...to, pressure: 1 },
		],
		sourceRect: { ...rect },
		rect,
		...StrokeStyle,
	};
}
