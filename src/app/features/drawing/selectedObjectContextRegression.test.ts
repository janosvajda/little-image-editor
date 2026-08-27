import { beforeEach, describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';

describe('selected object context', () => {
	beforeEach(() => {
		document.body.innerHTML =
			'<div id="options"><label id="tool-default">Tool color</label></div>';
	});

	it('replaces tool defaults only while an editable object is selected', () => {
		const objects = new AnnotationDocument();
		const options = document.querySelector<HTMLElement>('#options')!;
		new SelectedObjectPropertiesController(objects, options);
		objects.add({
			id: 'shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 0, y: 0, width: 20, height: 10 },
			color: '#000000',
			width: 2,
			opacity: 1,
			fill: false,
		});
		expect(options.classList).toContain('editing-selected-object');
		expect(
			options.querySelector('[data-object-property="fill"]')?.classList,
		).not.toContain('hidden');

		objects.select(null);
		expect(options.classList).not.toContain('editing-selected-object');
	});
});
