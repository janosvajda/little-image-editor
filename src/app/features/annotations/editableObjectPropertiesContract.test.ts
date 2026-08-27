import { describe, expect, it } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import {
	EditableObjectPropertyId,
	editableObjectProperties,
	setEditableObjectProperty,
} from './editableObjectProperties';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
} from './annotationTypes';

const OBJECTS: readonly AnnotationObject[] = [
	{
		id: 'stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 1, y: 1, pressure: 1 },
			{ x: 2, y: 2, pressure: 1 },
		],
		rect: { x: 1, y: 1, width: 1, height: 1 },
		color: '#000000',
		size: 12,
		opacity: 1,
		hardness: 0.8,
		seed: 1,
	},
	{
		id: 'shape',
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 1, y: 1, width: 10, height: 10 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: false,
	},
	{
		id: 'text',
		type: AnnotationObjectTypeId.Text,
		at: { x: 1, y: 10 },
		text: 'Text',
		color: '#000000',
		size: 12,
	},
];

describe('editable object property contract', () => {
	it('exposes only properties supported by each retained object type', () => {
		expect(editableObjectProperties(OBJECTS[0]!)).toEqual({
			color: '#000000',
			size: 12,
			opacity: 1,
			hardness: 0.8,
		});
		expect(editableObjectProperties(OBJECTS[1]!)).toEqual({
			color: '#000000',
			size: 2,
			opacity: 1,
			fill: false,
		});
		expect(editableObjectProperties(OBJECTS[2]!)).toEqual({
			color: '#000000',
			size: 12,
		});
	});

	it('updates retained properties through typed property identifiers', () => {
		const stroke = structuredClone(OBJECTS[0]!);
		setEditableObjectProperty(
			stroke,
			EditableObjectPropertyId.Color,
			'#12ab34',
		);
		setEditableObjectProperty(
			stroke,
			EditableObjectPropertyId.Size,
			24,
		);
		expect(stroke).toMatchObject({ color: '#12ab34', size: 24 });
	});
});
