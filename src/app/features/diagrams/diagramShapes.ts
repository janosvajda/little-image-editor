import type { CropRect, Point } from '../../core/document/appTypes';
import { ShapeToolId } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import type { LineEnd } from '../annotations/lineEnd';
import { AssistantCommandKind, type BoxShape, type DrawingCommand } from '../assistant/assistantCommandTypes';
import { DIAGRAM_LINE_HEIGHT, DiagramMetrics, textSize } from './diagramLayout';

/**
 * The pieces every diagram is drawn from: framed shapes, labels and lines,
 * as ordinary drawing commands in one theme, so any diagram is made of the
 * same editable items as a drawing.
 */

export const DiagramTheme = {
	NodeFill: ColorPalette.Porcelain,
	NodeBorder: ColorPalette.StormGray,
	Text: ColorPalette.Ink,
	GroupFill: ColorPalette.Cloud,
	GroupBorder: ColorPalette.CoolGray,
	GroupTitle: ColorPalette.StormGray,
	Link: ColorPalette.StormGray,
	LabelBackground: ColorPalette.White,
	NoteFill: ColorPalette.Cream,
	NoteBorder: ColorPalette.Ochre,
	Marker: ColorPalette.Ink,
} as const;
export const DiagramStroke = { Border: 2, Link: 2, ThickLink: 4, GroupBorder: 1.5 } as const;
export const LABEL_PADDING = 4;
const HALF = 2;
const SOLID = 1;
const NO_ROTATION = 0;

/** Moves layout coordinates to where the diagram is drawn, in whole pixels. */
export class Placement {
	constructor(private readonly origin: Point) {}

	at(point: Point): Point {
		return { x: Math.round(point.x + this.origin.x), y: Math.round(point.y + this.origin.y) };
	}

	box(rect: CropRect): CropRect {
		return { ...this.at(rect), width: Math.round(rect.width), height: Math.round(rect.height) };
	}
}

type ShapeCommand = Extract<DrawingCommand, { kind: typeof AssistantCommandKind.AddShape }>;

export function filledShape(shape: BoxShape, rect: CropRect, color: string): ShapeCommand {
	return { kind: AssistantCommandKind.AddShape, shape, rect, color, fill: true, strokeWidth: DiagramStroke.Border, opacity: SOLID, rotation: NO_ROTATION };
}

/** A filled shape with a border, as one item: its fill colour under an outline in the border colour. */
export function framedShape(shape: BoxShape, rect: CropRect, fill: string, border: string, width: number): DrawingCommand[] {
	return [{ ...filledShape(shape, rect, border), fillColor: fill, strokeWidth: width }];
}

export interface DiagramLineStyle {
	readonly color?: string;
	readonly width?: number;
	readonly dashed?: boolean;
	readonly arrow?: boolean;
	readonly head?: LineEnd;
	readonly tail?: LineEnd;
}

/** One line through the points, as one item however often it bends. */
export function diagramLine(points: readonly Point[], style: DiagramLineStyle = {}): DrawingCommand[] {
	const [from, ...rest] = points;
	const to = rest.pop();
	if (!from || !to) return [];
	return [
		{
			kind: AssistantCommandKind.AddLine,
			from,
			...(rest.length ? { via: rest } : {}),
			to,
			arrow: style.arrow ?? false,
			color: style.color ?? DiagramTheme.Link,
			width: style.width ?? DiagramStroke.Link,
			opacity: SOLID,
			...(style.dashed ? { dashed: true } : {}),
			...(style.head ? { head: style.head } : {}),
			...(style.tail ? { tail: style.tail } : {}),
		},
	];
}

/** Lines of text centred on a point, over a plain background when one is given so they stay readable on lines. */
export function centredLabel(lines: readonly string[], centre: Point, background?: string): DrawingCommand[] {
	const size = textSize(lines);
	const top = centre.y - size.height / HALF;
	const commands: DrawingCommand[] = [];
	if (background)
		commands.push(
			filledShape(
				ShapeToolId.Rectangle,
				{
					x: Math.round(centre.x - size.width / HALF - LABEL_PADDING),
					y: Math.round(top - LABEL_PADDING),
					width: Math.round(size.width + LABEL_PADDING * HALF),
					height: Math.round(size.height + LABEL_PADDING * HALF),
				},
				background,
			),
		);
	lines.forEach((line, index) => {
		const width = textSize([line]).width;
		commands.push(diagramText(line, { x: Math.round(centre.x - width / HALF), y: Math.round(lineBaseline(top, index)) }));
	});
	return commands;
}

/** Lines of text from a top left corner. */
export function leftAlignedLines(lines: readonly string[], topLeft: Point, color: string = DiagramTheme.Text): DrawingCommand[] {
	return lines.map((line, index) => diagramText(line, { x: Math.round(topLeft.x), y: Math.round(lineBaseline(topLeft.y, index)) }, color));
}

/** A text's point is the left end of its baseline, one font size below the top of its line. */
function lineBaseline(top: number, index: number): number {
	return top + index * DIAGRAM_LINE_HEIGHT + DiagramMetrics.FontSize;
}

export function diagramText(value: string, at: Point, color: string = DiagramTheme.Text): DrawingCommand {
	return { kind: AssistantCommandKind.AddText, at, text: value, color, size: DiagramMetrics.FontSize };
}
