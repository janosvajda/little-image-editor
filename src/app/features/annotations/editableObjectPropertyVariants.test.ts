import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import {
	EditableObjectPropertyId,
	editableObjectProperties,
	setEditableObjectProperty,
} from './editableObjectProperties';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
} from './annotationTypes';

describe('editable object property variants', () => {
	it('maps width, opacity, hardness, and fill to their owning object types', () => {
		const shape: AnnotationObject = {
			id: 'shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 0, y: 0, width: 10, height: 10 },
			color: '#000000',
			width: 2,
			opacity: 1,
			fill: false,
		};
		setEditableObjectProperty(shape, EditableObjectPropertyId.Size, 8);
		setEditableObjectProperty(shape, EditableObjectPropertyId.Opacity, 0.4);
		setEditableObjectProperty(shape, EditableObjectPropertyId.Fill, true);
		expect(editableObjectProperties(shape)).toMatchObject({
			size: 8,
			opacity: 0.4,
			fill: true,
		});
	});

	it('safely ignores properties unsupported by an object', () => {
		const text: AnnotationObject = {
			id: 'text',
			type: AnnotationObjectTypeId.Text,
			at: { x: 0, y: 12 },
			text: 'Text',
			color: '#000000',
			size: 12,
		};
		setEditableObjectProperty(text, EditableObjectPropertyId.Opacity, 0.5);
		setEditableObjectProperty(text, EditableObjectPropertyId.Hardness, 0.5);
		setEditableObjectProperty(text, EditableObjectPropertyId.Fill, true);
		setEditableObjectProperty(text, EditableObjectPropertyId.Color, 12);
		setEditableObjectProperty(text, EditableObjectPropertyId.Size, 'large');
		expect(text).toMatchObject({ color: '#000000', size: 12 });
	});
});
