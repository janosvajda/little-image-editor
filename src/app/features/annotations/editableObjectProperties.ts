import {
	AnnotationObjectTypeId,
	type AnnotationObject,
} from './annotationTypes';

export const EditableObjectPropertyId = {
	Color: 'color',
	Size: 'size',
	Opacity: 'opacity',
	Hardness: 'hardness',
	Fill: 'fill',
} as const;
export type EditableObjectProperty =
	(typeof EditableObjectPropertyId)[keyof typeof EditableObjectPropertyId];

export interface EditableObjectPropertyValues {
	readonly color?: string;
	readonly size?: number;
	readonly opacity?: number;
	readonly hardness?: number;
	readonly fill?: boolean;
}

export function editableObjectProperties(
	object: AnnotationObject,
): EditableObjectPropertyValues {
	if (object.type === AnnotationObjectTypeId.Stroke) return {};
	return {
		...('color' in object ? { color: object.color } : {}),
		...('size' in object
			? { size: object.size }
			: 'width' in object
				? { size: object.width }
				: {}),
		...('opacity' in object ? { opacity: object.opacity } : {}),
		...(object.type === AnnotationObjectTypeId.Shape
			? { fill: object.fill }
			: {}),
	};
}

export function setEditableObjectProperty(
	object: AnnotationObject,
	property: EditableObjectProperty,
	value: string | number | boolean,
): void {
	if (object.type === AnnotationObjectTypeId.Stroke) return;
	switch (property) {
		case EditableObjectPropertyId.Color:
			setColor(object, value);
			break;
		case EditableObjectPropertyId.Size:
			setSize(object, value);
			break;
		case EditableObjectPropertyId.Opacity:
			setOpacity(object, value);
			break;
		case EditableObjectPropertyId.Hardness:
			setHardness(object, value);
			break;
		case EditableObjectPropertyId.Fill:
			setFill(object, value);
			break;
	}
}

function setColor(object: AnnotationObject, value: unknown): void {
	if (!('color' in object) || typeof value !== 'string') return;
	object.color = value;
}

function setSize(object: AnnotationObject, value: unknown): void {
	if (typeof value !== 'number') return;
	if ('size' in object) {
		object.size = value;
	} else if ('width' in object) object.width = value;
}

function setOpacity(object: AnnotationObject, value: unknown): void {
	if (!('opacity' in object) || typeof value !== 'number') return;
	object.opacity = value;
}

function setHardness(object: AnnotationObject, value: unknown): void {
	if ('hardness' in object && typeof value === 'number') object.hardness = value;
}

function setFill(object: AnnotationObject, value: unknown): void {
	if (
		object.type === AnnotationObjectTypeId.Shape &&
		typeof value === 'boolean'
	)
		object.fill = value;
}
