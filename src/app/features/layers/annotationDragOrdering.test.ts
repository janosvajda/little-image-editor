import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';

describe('annotation drag ordering', () => {
	it('moves an object to another object position and records one undo step', () => {
		const document = new AnnotationDocument();
		for (const id of ['back', 'middle', 'front']) document.add(shape(id));

		document.moveItemTo('front', 'back');

		expect(document.state.objects.map(({ id }) => id)).toEqual([
			'front',
			'back',
			'middle',
		]);
		expect(document.hitTest({ x: 10, y: 10 })?.id).toBe('middle');
		document.undo();
		expect(document.state.objects.map(({ id }) => id)).toEqual([
			'back',
			'middle',
			'front',
		]);
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
