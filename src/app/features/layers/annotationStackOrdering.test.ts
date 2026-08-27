import { describe, expect, it } from 'vitest';
import {
	AnnotationDocument,
	AnnotationStackDirection,
} from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { ShapeToolId } from '../../core/document/appTypes';

describe('annotation stacking order', () => {
	it('reorders objects through the document and preserves undo history', () => {
		const document = new AnnotationDocument();
		document.add(shape('back'));
		document.add(shape('front'));

		document.reorder('back', AnnotationStackDirection.Forward);

		expect(document.state.objects.map(({ id }) => id)).toEqual([
			'front',
			'back',
		]);
		expect(document.hitTest({ x: 10, y: 10 })?.id).toBe('back');
		document.undo();
		expect(document.state.objects.map(({ id }) => id)).toEqual([
			'back',
			'front',
		]);
		expect(document.hitTest({ x: 10, y: 10 })?.id).toBe('front');
	});
});

function shape(id: string): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 0, y: 0, width: 20, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
	};
}
