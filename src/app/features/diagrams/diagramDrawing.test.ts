import { describe, expect, it } from 'vitest';
import type { CropRect } from '../../core/document/appTypes';
import { AssistantCommandKind, type DrawingCommand } from '../assistant/assistantCommandTypes';
import { DiagramLayer, drawMermaidFlowchart } from './diagramDrawing';
import { DiagramMetrics, layoutFlowchart } from './diagramLayout';
import { parseFlowchart } from './mermaidFlowchart';

const overlaps = (a: CropRect, b: CropRect) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const contains = (outer: CropRect, inner: CropRect) =>
	inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

describe('laying out a flowchart', () => {
	it('puts each step after the one it comes from, along the direction, with no boxes overlapping', () => {
		for (const [direction, axis] of [['LR', 'x'], ['TD', 'y'], ['RL', 'x'], ['BT', 'y']] as const) {
			const layout = layoutFlowchart(parseFlowchart(`flowchart ${direction}\n a --> b --> c\n a --> d --> c\n c --> a`));
			const rect = (id: string) => layout.nodes.find(({ node }) => node.id === id)!.rect;
			const before = (first: string, second: string) =>
				direction === 'RL' || direction === 'BT' ? rect(first)[axis] > rect(second)[axis] : rect(first)[axis] < rect(second)[axis];
			expect(before('a', 'b')).toBe(true);
			expect(before('b', 'c')).toBe(true);
			for (const first of layout.nodes)
				for (const second of layout.nodes) if (first !== second) expect(overlaps(first.rect, second.rect)).toBe(false);
		}
	});

	it('sizes boxes to their text, frames groups around their members, and fits everything inside the margin', () => {
		const layout = layoutFlowchart(
			parseFlowchart('flowchart LR\n subgraph backend [Back end]\n  api[A rather long service name] --> db[(DB)]\n end\n web --> api'),
		);
		const api = layout.nodes.find(({ node }) => node.id === 'api')!.rect;
		const db = layout.nodes.find(({ node }) => node.id === 'db')!.rect;
		expect(api.width).toBeGreaterThan(db.width);
		const [group] = layout.groups;
		expect(contains(group!.rect, api) && contains(group!.rect, db)).toBe(true);
		for (const rect of [...layout.nodes.map((node) => node.rect), group!.rect]) {
			expect(rect.x).toBeGreaterThanOrEqual(DiagramMetrics.Margin - 1);
			expect(rect.x + rect.width).toBeLessThanOrEqual(layout.width - DiagramMetrics.Margin + 1);
			expect(rect.y + rect.height).toBeLessThanOrEqual(layout.height - DiagramMetrics.Margin + 1);
		}
	});

	it('never frames a node in a group it does not belong to, and keeps the diagram compact', () => {
		const layout = layoutFlowchart(
			parseFlowchart(`flowchart LR
  subgraph shells [Shells]
    web & chrome & vscode
  end
  subgraph core [Shared editor]
    editor --> layers & diagrams
  end
  web & chrome & vscode --> editor
  vscode --> assistant((Assistant))
  assistant --> diagrams`),
		);
		for (const { group, rect } of layout.groups)
			for (const { node, rect: nodeRect } of layout.nodes)
				if (!group.nodeIds.includes(node.id)) expect(overlaps(rect, nodeRect)).toBe(false);
		// Blocks in different ranks share space instead of stacking up.
		expect(layout.height).toBeLessThan(layout.width);
	});

	it('joins nodes side to side with right-angled turns', () => {
		const layout = layoutFlowchart(parseFlowchart('flowchart TD\n a --> b\n a --> c'));
		for (const { points } of layout.links) {
			for (const [index, point] of points.slice(1).entries()) {
				const previous = points[index]!;
				expect(point.x === previous.x || point.y === previous.y).toBe(true);
			}
		}
	});
});

describe('drawing a flowchart', () => {
	it('draws groups, then connections, then nodes, each on its own named layer', () => {
		const { commands, width, height } = drawMermaidFlowchart(
			'flowchart LR\n subgraph s [Services]\n  a[Web] -->|calls| b[API]\n end',
			{ x: 10, y: 20 },
		);
		const layers = commands.filter((command) => command.kind === AssistantCommandKind.AddLayer).map((command) => 'name' in command && command.name);
		expect(layers).toEqual([DiagramLayer.Groups, DiagramLayer.Connections, DiagramLayer.Nodes]);
		const texts = commands.filter((command): command is Extract<DrawingCommand, { kind: 'addText' }> => command.kind === AssistantCommandKind.AddText);
		expect(texts.map(({ text }) => text)).toEqual(['Services', 'calls', 'Web', 'API']);
		const arrows = commands.filter((command) => command.kind === AssistantCommandKind.AddLine && command.arrow);
		expect(arrows).toHaveLength(1);
		expect(width).toBeGreaterThan(0);
		expect(height).toBeGreaterThan(0);
		// The origin moves everything; nothing starts before it.
		for (const command of commands)
			if (command.kind === AssistantCommandKind.AddShape) expect(command.rect.x).toBeGreaterThanOrEqual(10);
	});
});
