import { describe, expect, it } from 'vitest';
import type { CropRect, Point } from '../../core/document/appTypes';
import { ShapeToolId } from '../../core/document/appTypes';
import { LineEnd } from '../annotations/lineEnd';
import { AssistantCommandKind, type DrawingCommand } from '../assistant/assistantCommandTypes';
import { DiagramLayer, drawMermaidDiagram } from './diagramDrawing';
import { DiagramMetrics, layoutFlowchart } from './diagramLayout';
import { MermaidDiagramKind, parseMermaid } from './mermaidDiagram';
import { NodeShape, parseFlowchart } from './mermaidFlowchart';
import { parseStateDiagram } from './mermaidState';
import { DiagramSyntaxError } from './mermaidText';
import { SequenceLayer } from './sequenceDrawing';

const layersOf = (commands: readonly DrawingCommand[]) =>
	commands.flatMap((command) => (command.kind === AssistantCommandKind.AddLayer && command.name ? [command.name] : []));
const textsOf = (commands: readonly DrawingCommand[]) => commands.flatMap((command) => (command.kind === AssistantCommandKind.AddText ? [command.text] : []));
const overlaps = (a: CropRect, b: CropRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** Whether a straight piece between two points runs through a rectangle's inside. */
const crosses = (from: Point, to: Point, rect: CropRect) =>
	overlaps({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x) || 1, height: Math.abs(to.y - from.y) || 1 }, { x: rect.x + 1, y: rect.y + 1, width: rect.width - 2, height: rect.height - 2 });

describe('reading any Mermaid diagram', () => {
	it('picks the reader by the first statement, after Markdown fences, front matter and comments', () => {
		expect(parseMermaid('graph TD\n  a --> b').kind).toBe(MermaidDiagramKind.Graph);
		expect(parseMermaid('%% notes\nstateDiagram-v2\n  [*] --> A').kind).toBe(MermaidDiagramKind.Graph);
		expect(parseMermaid('---\ntitle: Shop\n---\nclassDiagram\n  A <|-- B').kind).toBe(MermaidDiagramKind.Graph);
		expect(parseMermaid('# Flow\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n').kind).toBe(MermaidDiagramKind.Sequence);
	});

	it('names the diagrams it reads when it meets another kind', () => {
		const message = 'Line 1: Supported Mermaid diagrams start with flowchart, graph, stateDiagram-v2, classDiagram or sequenceDiagram.';
		expect(() => parseMermaid('pie title Pets\n  "Dogs" : 3')).toThrow(new DiagramSyntaxError(message));
		expect(() => parseMermaid('')).toThrow(new DiagramSyntaxError(message));
	});
});

describe('drawing every kind of diagram', () => {
	it('draws state diagrams: dots for start and end, bars, small diamonds and notes', () => {
		const { commands, width, height } = drawMermaidDiagram(`stateDiagram-v2
  state fork <<fork>>
  state pick <<choice>>
  [*] --> fork
  fork --> A
  A --> pick
  pick --> [*]
  note right of A : remember`);
		expect(layersOf(commands)).toEqual([DiagramLayer.Connections, DiagramLayer.Nodes]);
		const shapes = commands.filter((command) => command.kind === AssistantCommandKind.AddShape);
		// The start dot, and the end's ring around its dot.
		expect(shapes.filter((shape) => shape.shape === ShapeToolId.Ellipse && shape.fill)).toHaveLength(2);
		expect(shapes.filter((shape) => shape.shape === ShapeToolId.Ellipse && !shape.fill)).toHaveLength(1);
		expect(shapes.filter((shape) => shape.shape === ShapeToolId.Diamond)).toHaveLength(1);
		expect(textsOf(commands)).toEqual(expect.arrayContaining(['A', 'remember']));
		expect(width).toBeGreaterThan(0);
		expect(height).toBeGreaterThan(0);
	});

	it('draws a class as a box with ruled sections, and its relations with their ends and multiplicities', () => {
		const { commands } = drawMermaidDiagram(`classDiagram
  class Car {
    +String model
    +drive()
  }
  Car "1" *-- "4" Wheel : has`);
		const lines = commands.filter((command) => command.kind === AssistantCommandKind.AddLine);
		expect(lines.filter((line) => line.tail === LineEnd.FilledDiamond)).toHaveLength(1);
		// Two rules in each class box: above its attributes and above its methods.
		expect(lines.filter((line) => line.from.y === line.to.y && !line.tail && !line.head && !line.arrow)).toHaveLength(4);
		expect(textsOf(commands)).toEqual(expect.arrayContaining(['Car', '+String model', '+drive()', 'Wheel', 'has', '1', '4']));
	});

	it('draws sequence diagrams on their own layers', () => {
		const { commands } = drawMermaidDiagram('sequenceDiagram\n  A->>B: hi\n  Note over A: thinking');
		expect(layersOf(commands)).toEqual([SequenceLayer.Lifelines, SequenceLayer.Messages, SequenceLayer.Notes, SequenceLayer.Participants]);
	});

	it('places a whole drawing at its origin', () => {
		const origin = { x: 300, y: 200 };
		const { commands } = drawMermaidDiagram('classDiagram\n  A <|-- B', origin);
		for (const command of commands) if (command.kind === AssistantCommandKind.AddShape) expect(command.rect.x).toBeGreaterThanOrEqual(origin.x);
	});
});

describe('routing links against the flow', () => {
	it('takes a link back up around the side, through the gaps between ranks, never through a box', () => {
		const chart = parseFlowchart(`flowchart TD
  a[Start] --> b[Middle one] --> c[Lower] --> d[End]
  b --> e[Beside]
  d -->|again| a`);
		const layout = layoutFlowchart(chart);
		const back = layout.links.find(({ link }) => link.from === 'd' && link.to === 'a')!;
		expect(back.points.length).toBeGreaterThan(2);
		for (const [index, point] of back.points.slice(1).entries())
			for (const { node, rect } of layout.nodes)
				if (node.id !== 'a' && node.id !== 'd') expect(crosses(back.points[index]!, point, rect)).toBe(false);
		// It ends on the target's far side, pointing back into it.
		const target = layout.nodes.find(({ node }) => node.id === 'a')!.rect;
		expect(back.points.at(-1)!.y).toBe(target.y + target.height);
		for (const { rect } of layout.nodes) expect(rect.x).toBeGreaterThanOrEqual(DiagramMetrics.Margin - 1);
		expect(back.middle.x + 1).toBeLessThan(layout.width);
	});

	it('loops a link from a state to itself beside it', () => {
		const layout = layoutFlowchart(parseStateDiagram('stateDiagram-v2\n  Polling --> Polling : tick'));
		const loop = layout.links.find(({ link }) => link.from === 'Polling' && link.to === 'Polling')!;
		const rect = layout.nodes.find(({ node }) => node.id === 'Polling')!.rect;
		expect(loop.points).toHaveLength(4);
		expect(loop.points.every(({ x }) => x >= rect.x + rect.width)).toBe(true);
		expect(loop.middle.x).toBeGreaterThan(rect.x + rect.width);
		expect(layout.width).toBeGreaterThan(rect.x + rect.width + DiagramMetrics.SelfLoopSize);
	});

	it('sizes start dots, bars, choices and classes for what they are', () => {
		const layout = layoutFlowchart(
			parseStateDiagram('stateDiagram-v2\n  direction LR\n  state f <<fork>>\n  state c <<choice>>\n  [*] --> f\n  f --> c\n  c --> [*]'),
		);
		const sizeOf = (shape: NodeShape) => layout.nodes.find(({ node }) => node.shape === shape)!.rect;
		expect(sizeOf(NodeShape.Start)).toMatchObject({ width: DiagramMetrics.StartDiameter, height: DiagramMetrics.StartDiameter });
		expect(sizeOf(NodeShape.End)).toMatchObject({ width: DiagramMetrics.EndDiameter });
		// Across a left-to-right flow, a bar stands upright.
		expect(sizeOf(NodeShape.Bar)).toMatchObject({ width: DiagramMetrics.BarThickness, height: DiagramMetrics.BarLength });
		expect(sizeOf(NodeShape.Choice)).toMatchObject({ width: DiagramMetrics.ChoiceSize });
	});
});
