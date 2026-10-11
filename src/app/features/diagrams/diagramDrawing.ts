import type { CropRect, Point } from '../../core/document/appTypes';
import { ShapeToolId } from '../../core/document/appTypes';
import { AssistantCommandKind, type BoxShape, type DrawingCommand, DrawingDefault, type NewImageSpec } from '../assistant/assistantCommandTypes';
import {
	type DiagramLayout,
	DiagramMetrics,
	type PlacedLink,
	type PlacedNode,
	layoutFlowchart,
	sectionHeight,
	textSize,
} from './diagramLayout';
import {
	centredLabel,
	DiagramStroke,
	DiagramTheme,
	diagramLine,
	diagramText,
	filledShape,
	framedShape,
	LABEL_PADDING,
	leftAlignedLines,
	Placement,
} from './diagramShapes';
import { MermaidDiagramKind, parseMermaid } from './mermaidDiagram';
import { LABEL_LINE_BREAK, LinkLine, NodeShape, parseFlowchart } from './mermaidFlowchart';
import { drawSequenceDiagram } from './sequenceDrawing';

/**
 * Turns a laid-out diagram into ordinary drawing commands, so a diagram is
 * made of the same editable shapes, lines and texts as any drawing, on
 * named layers, and lands in one undo step through a batch.
 */

export const DiagramLayer = { Groups: 'Groups', Connections: 'Connections', Nodes: 'Nodes' } as const;

const GROUP_TITLE_INSET = 10;
const HALF = 2;
/** How far a ring's dot sits inside it. */
const END_DOT_INSET = 6;
/** How far an end's label sits from the line's tip, along the line and beside it. */
const EndLabelOffset = { Along: 18, Beside: 6 } as const;
const FRAMED_SHAPES: Readonly<Partial<Record<NodeShape, BoxShape>>> = {
	[NodeShape.Box]: ShapeToolId.Rectangle,
	[NodeShape.Rounded]: ShapeToolId.RoundedRectangle,
	[NodeShape.Circle]: ShapeToolId.Ellipse,
	[NodeShape.Diamond]: ShapeToolId.Diamond,
	[NodeShape.Choice]: ShapeToolId.Diamond,
};

export interface DiagramDrawing {
	readonly commands: readonly DrawingCommand[];
	readonly width: number;
	readonly height: number;
}

/** The file name a diagram's new image gets, until someone names it. */
export const DIAGRAM_IMAGE_NAME = 'diagram.png';

/** A new image just big enough for a diagram, on the white it is drawn for. */
export function diagramImageSpec({ width, height }: Pick<DiagramDrawing, 'width' | 'height'>): NewImageSpec {
	return { width, height, background: DrawingDefault.Background, transparent: false };
}

/** Any supported Mermaid diagram as drawing commands, placed with its top left corner at `origin`. */
export function drawMermaidDiagram(source: string, origin: Point = { x: 0, y: 0 }): DiagramDrawing {
	const diagram = parseMermaid(source);
	if (diagram.kind === MermaidDiagramKind.Sequence) return drawSequenceDiagram(diagram.diagram, origin);
	const layout = layoutFlowchart(diagram.chart);
	return { commands: diagramCommands(layout, origin), width: layout.width, height: layout.height };
}

/** A Mermaid flowchart as drawing commands, placed with its top left corner at `origin`. */
export function drawMermaidFlowchart(source: string, origin: Point = { x: 0, y: 0 }): DiagramDrawing {
	const layout = layoutFlowchart(parseFlowchart(source));
	return { commands: diagramCommands(layout, origin), width: layout.width, height: layout.height };
}

export function diagramCommands(layout: DiagramLayout, origin: Point): DrawingCommand[] {
	const place = new Placement(origin);
	return [
		...(layout.groups.length ? groupCommands(layout, place) : []),
		{ kind: AssistantCommandKind.AddLayer, name: DiagramLayer.Connections },
		...layout.links.flatMap((placed) => linkCommands(placed, place)),
		{ kind: AssistantCommandKind.AddLayer, name: DiagramLayer.Nodes },
		...layout.nodes.flatMap((placed) => nodeCommands(placed, place)),
	];
}

function groupCommands(layout: DiagramLayout, place: Placement): DrawingCommand[] {
	return [
		{ kind: AssistantCommandKind.AddLayer, name: DiagramLayer.Groups },
		...layout.groups.flatMap(({ group, rect }) => [
			...framedShape(ShapeToolId.RoundedRectangle, place.box(rect), DiagramTheme.GroupFill, DiagramTheme.GroupBorder, DiagramStroke.GroupBorder),
			diagramText(group.label, place.at({ x: rect.x + GROUP_TITLE_INSET, y: rect.y + DiagramMetrics.GroupTitle - LABEL_PADDING }), DiagramTheme.GroupTitle),
		]),
	];
}

function nodeCommands({ node, rect }: PlacedNode, place: Placement): DrawingCommand[] {
	const box = place.box(rect);
	const centre = place.at(middleOf(rect));
	switch (node.shape) {
		case NodeShape.Start:
		case NodeShape.Bar:
			return [filledShape(node.shape === NodeShape.Start ? ShapeToolId.Ellipse : ShapeToolId.Rectangle, box, DiagramTheme.Marker)];
		case NodeShape.End:
			return [
				{ ...filledShape(ShapeToolId.Ellipse, box, DiagramTheme.Marker), fill: false },
				filledShape(ShapeToolId.Ellipse, inset(box, END_DOT_INSET), DiagramTheme.Marker),
			];
		case NodeShape.Note:
			return [...framedShape(ShapeToolId.Rectangle, box, DiagramTheme.NoteFill, DiagramTheme.NoteBorder, DiagramStroke.GroupBorder), ...centredLabel(node.label, centre)];
		case NodeShape.Class:
			return classCommands(node.label, node.sections ?? [], box);
	}
	const shape = FRAMED_SHAPES[node.shape] ?? ShapeToolId.Rectangle;
	return [...framedShape(shape, box, DiagramTheme.NodeFill, DiagramTheme.NodeBorder, DiagramStroke.Border), ...centredLabel(node.label, centre)];
}

/** A class: its title centred in the top section, then each section under a rule, its lines from the left. */
function classCommands(title: readonly string[], sections: readonly (readonly string[])[], box: CropRect): DrawingCommand[] {
	const titleHeight = textSize(title).height + DiagramMetrics.PaddingY * HALF;
	const commands = [
		...framedShape(ShapeToolId.Rectangle, box, DiagramTheme.NodeFill, DiagramTheme.NodeBorder, DiagramStroke.Border),
		...centredLabel(title, { x: box.x + box.width / HALF, y: box.y + titleHeight / HALF }),
	];
	let top = box.y + titleHeight;
	for (const lines of sections) {
		commands.push(...diagramLine([{ x: box.x, y: Math.round(top) }, { x: box.x + box.width, y: Math.round(top) }], { color: DiagramTheme.NodeBorder, width: DiagramStroke.GroupBorder }));
		commands.push(...leftAlignedLines(lines, { x: box.x + DiagramMetrics.PaddingX, y: top + DiagramMetrics.SectionPadding }));
		top += sectionHeight(lines);
	}
	return commands;
}

/** One item per link: its bends travel with it, and a dotted link is drawn in dashes. */
function linkCommands({ link, points, middle }: PlacedLink, place: Placement): DrawingCommand[] {
	const placed = points.map((point) => place.at(point));
	if (placed.length < HALF) return [];
	return [
		...diagramLine(placed, {
			arrow: link.arrow,
			width: link.line === LinkLine.Thick ? DiagramStroke.ThickLink : DiagramStroke.Link,
			dashed: link.line === LinkLine.Dotted,
			...(link.head ? { head: link.head } : {}),
			...(link.tail ? { tail: link.tail } : {}),
		}),
		...(link.label ? centredLabel(link.label.split(LABEL_LINE_BREAK), place.at(middle), DiagramTheme.LabelBackground) : []),
		...(link.tailLabel ? endLabel(link.tailLabel, placed[0]!, placed[1]!) : []),
		...(link.headLabel ? endLabel(link.headLabel, placed.at(-1)!, placed.at(-2)!) : []),
	];
}

/** Words beside a line's end, a little back from its tip and clear of the line, such as a multiplicity. */
function endLabel(label: string, tip: Point, towards: Point): DrawingCommand[] {
	const length = Math.hypot(towards.x - tip.x, towards.y - tip.y) || 1;
	const along = { x: (towards.x - tip.x) / length, y: (towards.y - tip.y) / length };
	const size = textSize([label]);
	// Beside the line by the gap plus half the label's extent in that direction.
	const beside = EndLabelOffset.Beside + (Math.abs(along.y) * size.width + Math.abs(along.x) * size.height) / HALF;
	const centre = {
		x: tip.x + along.x * EndLabelOffset.Along - along.y * beside,
		y: tip.y + along.y * EndLabelOffset.Along + along.x * beside,
	};
	return centredLabel([label], centre);
}

function middleOf(rect: CropRect): Point {
	return { x: rect.x + rect.width / HALF, y: rect.y + rect.height / HALF };
}

function inset(rect: CropRect, by: number): CropRect {
	return { x: rect.x + by, y: rect.y + by, width: rect.width - by * HALF, height: rect.height - by * HALF };
}
