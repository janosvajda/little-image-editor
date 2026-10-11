import type { PathAnnotation, ShapeAnnotation } from './annotationTypes';

/**
 * How a shape or path is drawn, as painting programs offer it on their shape
 * tools: only its outline in the line colour, only its inside in the fill
 * colour, or both. The colours themselves are only colours.
 */
export const ShapeStyle = { Outline: 'outline', Fill: 'fill', OutlineAndFill: 'outlineAndFill' } as const;
export type ShapeStyle = (typeof ShapeStyle)[keyof typeof ShapeStyle];

/** The outline a shape gets back when it stops being fill only and had none. */
export const DEFAULT_OUTLINE_WIDTH = 2;

export function isShapeStyle(value: unknown): value is ShapeStyle {
	return Object.values(ShapeStyle).some((style) => style === value);
}

/** A shape's style from what it draws: no fill is an outline, no line is a fill. */
export function shapeStyleOf({ fill, width }: Pick<ShapeAnnotation, 'fill' | 'width'>): ShapeStyle {
	if (!fill) return ShapeStyle.Outline;
	return width > 0 ? ShapeStyle.OutlineAndFill : ShapeStyle.Fill;
}

/** The fields a new shape or path of a style gets, from the line width and the fill colour. */
export function styledFields(style: ShapeStyle, width: number, fillColor: string): Pick<ShapeAnnotation, 'fill' | 'width'> & Partial<Pick<ShapeAnnotation, 'fillColor'>> {
	if (style === ShapeStyle.Outline) return { fill: false, width };
	return { fill: true, fillColor, width: style === ShapeStyle.Fill ? 0 : width };
}

/** Changes an existing shape's or path's style, keeping its colours; a fill it had none of starts from its fill colour. */
export function applyShapeStyle(item: ShapeAnnotation | PathAnnotation, style: ShapeStyle, fillColor: string): void {
	const outlined = item.width > 0 ? item.width : DEFAULT_OUTLINE_WIDTH;
	if (style === ShapeStyle.Outline) {
		item.fill = false;
		item.width = outlined;
		return;
	}
	if (!item.fill && item.fillColor === undefined && !item.fillGradient && !item.fillPattern) item.fillColor = fillColor;
	item.fill = true;
	item.width = style === ShapeStyle.Fill ? 0 : outlined;
}
