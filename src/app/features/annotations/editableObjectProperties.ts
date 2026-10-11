import { ColorPalette } from '../../core/document/colorPalette';
import { type Gradient, GradientKind, linearGradient, radialGradient, withKind } from '../../core/geometry/gradient';
import { DEFAULT_PATTERN_SIZE, isPatternKind, PatternKind, PatternSize, patternOf } from '../../core/geometry/fillPattern';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type PathAnnotation,
	type ShapeAnnotation,
} from './annotationTypes';
import { restyleStroke, type StrokeStyleChange } from './strokeGeometry';

export const EditableObjectPropertyId = {
	Color: 'color',
	Size: 'size',
	Opacity: 'opacity',
	Hardness: 'hardness',
	Fill: 'fill',
	/** Solid, or a linear or radial gradient. */
	FillStyle: 'fillStyle',
	/** A solid fill's colour, or a gradient's first colour. */
	FillColor: 'fillColor',
	/** A gradient's last colour, or what shows between a pattern's marks. */
	FillColorEnd: 'fillColorEnd',
	/** A pattern's tile size. */
	PatternSize: 'patternSize',
} as const;
export type EditableObjectProperty =
	(typeof EditableObjectPropertyId)[keyof typeof EditableObjectPropertyId];

export interface EditableObjectPropertyValues {
	readonly color?: string;
	readonly size?: number;
	readonly opacity?: number;
	readonly hardness?: number;
	readonly fill?: boolean;
	readonly fillStyle?: FillStyle;
	/** Only for a filled item: its fill, which is its colour until it has a fill of its own, or its gradient's first colour. */
	readonly fillColor?: string;
	/** Only for a gradient fill: its last colour; for a pattern, its background. */
	readonly fillColorEnd?: string;
	/** Only for a pattern fill: its tile's side. */
	readonly patternSize?: number;
}

/** How an item is filled: with one colour, a gradient of either kind, or a pattern. */
export const FillStyle = { Solid: 'solid', ...GradientKind, ...PatternKind } as const;
export type FillStyle = (typeof FillStyle)[keyof typeof FillStyle];

export function isFillStyle(value: unknown): value is FillStyle {
	return Object.values(FillStyle).some((style) => style === value);
}

/** The colour a new gradient ends in, and a new pattern's background, until another is chosen. */
const NEW_GRADIENT_END = ColorPalette.White;

export function editableObjectProperties(
	object: AnnotationObject,
): EditableObjectPropertyValues {
	if (object.type === AnnotationObjectTypeId.Stroke)
		return {
			color: object.color,
			size: object.size,
			opacity: object.opacity,
			hardness: object.hardness,
		};
	return {
		...('color' in object ? { color: object.color } : {}),
		...('size' in object
			? { size: object.size }
			: 'width' in object
				? { size: object.width }
				: {}),
		...('opacity' in object ? { opacity: object.opacity } : {}),
		...(isFillable(object) ? { fill: object.fill, ...(object.fill ? fillValues(object) : {}) } : {}),
	};
}

export function setEditableObjectProperty(
	object: AnnotationObject,
	property: EditableObjectProperty,
	value: string | number | boolean,
): void {
	if (object.type === AnnotationObjectTypeId.Stroke) {
		restyleStroke(object, strokeStyleChange(property, value));
		return;
	}
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
		case EditableObjectPropertyId.FillColor:
			setFillColor(object, value);
			break;
		case EditableObjectPropertyId.FillStyle:
			setFillStyle(object, value);
			break;
		case EditableObjectPropertyId.FillColorEnd:
			setGradientEnd(object, value);
			break;
		case EditableObjectPropertyId.PatternSize:
			setPatternSize(object, value);
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
	if (isFillable(object) && typeof value === 'boolean') object.fill = value;
}

/** Items with an inside to fill: shapes and paths. */
function isFillable(object: AnnotationObject): object is ShapeAnnotation | PathAnnotation {
	return object.type === AnnotationObjectTypeId.Shape || object.type === AnnotationObjectTypeId.Path;
}

function fillValues(object: ShapeAnnotation | PathAnnotation): Pick<EditableObjectPropertyValues, 'fillStyle' | 'fillColor' | 'fillColorEnd' | 'patternSize'> {
	const { fillPattern: pattern, fillGradient: gradient } = object;
	if (pattern)
		return { fillStyle: pattern.kind, fillColor: pattern.color, ...(pattern.background === undefined ? {} : { fillColorEnd: pattern.background }), patternSize: pattern.size };
	if (!gradient) return { fillStyle: FillStyle.Solid, fillColor: object.fillColor ?? object.color };
	return { fillStyle: gradient.kind, fillColor: gradient.stops[0]!.color, fillColorEnd: gradient.stops.at(-1)!.color };
}

/**
 * An item's fill colour, filled or not: what its fill is, or would be once
 * filled. Shown and chosen like its line colour, as in painting programs.
 */
export function fillColorOf(object: Readonly<AnnotationObject>): string | undefined {
	if (!isFillable(object)) return undefined;
	return fillColors(object)[0];
}

/** Choosing a fill colour fills the item, so the colour shows, as painting programs do. */
function setFillColor(object: AnnotationObject, value: unknown): void {
	if (!isFillable(object) || typeof value !== 'string') return;
	if (!object.fill) {
		object.fill = true;
		object.fillColor = value;
		return;
	}
	if (object.fillPattern) object.fillPattern = { ...object.fillPattern, color: value };
	else if (object.fillGradient) object.fillGradient = withStopColor(object.fillGradient, 0, value);
	else object.fillColor = value;
}

function setGradientEnd(object: AnnotationObject, value: unknown): void {
	if (!isFillable(object) || typeof value !== 'string') return;
	if (object.fillPattern) object.fillPattern = { ...object.fillPattern, background: value };
	else if (object.fillGradient) object.fillGradient = withStopColor(object.fillGradient, object.fillGradient.stops.length - 1, value);
}

function setPatternSize(object: AnnotationObject, value: unknown): void {
	if (isFillable(object) && object.fillPattern && typeof value === 'number')
		object.fillPattern = { ...object.fillPattern, size: Math.min(PatternSize.Maximum, Math.max(PatternSize.Minimum, value)) };
}

/** A fill's two colours, whatever it is now: its colour and its end or background. */
function fillColors(object: ShapeAnnotation | PathAnnotation): readonly [string, string] {
	const { fillPattern: pattern, fillGradient: gradient } = object;
	if (pattern) return [pattern.color, pattern.background ?? NEW_GRADIENT_END];
	if (gradient) return [gradient.stops[0]!.color, gradient.stops.at(-1)!.color];
	return [object.fillColor ?? object.color, NEW_GRADIENT_END];
}

/**
 * Solid keeps the fill's colour; a gradient or a pattern starts from the
 * fill's two colours, and a gradient changing kind keeps its stops.
 */
function setFillStyle(object: AnnotationObject, value: unknown): void {
	if (!isFillable(object) || !isFillStyle(value)) return;
	const [first, second] = fillColors(object);
	const { fillGradient: gradient, fillPattern: pattern } = object;
	Reflect.deleteProperty(object, 'fillGradient');
	Reflect.deleteProperty(object, 'fillPattern');
	if (value === FillStyle.Solid) {
		if (gradient || pattern) object.fillColor = first;
		return;
	}
	if (isPatternKind(value)) {
		object.fillPattern = patternOf(value, first, second, pattern?.size ?? DEFAULT_PATTERN_SIZE);
		return;
	}
	object.fillGradient = gradient ? withKind(gradient, value) : value === GradientKind.Linear ? linearGradient([first, second]) : radialGradient([first, second]);
}

function withStopColor(gradient: Gradient, index: number, color: string): Gradient {
	return { ...gradient, stops: gradient.stops.map((stop, stopIndex) => (stopIndex === index ? { ...stop, color } : stop)) };
}

function strokeStyleChange(
	property: EditableObjectProperty,
	value: string | number | boolean,
): StrokeStyleChange {
	if (property === EditableObjectPropertyId.Color)
		return typeof value === 'string' ? { color: value } : {};
	if (typeof value !== 'number') return {};
	if (property === EditableObjectPropertyId.Size) return { size: value };
	if (property === EditableObjectPropertyId.Opacity) return { opacity: value };
	if (property === EditableObjectPropertyId.Hardness) return { hardness: value };
	return {};
}
