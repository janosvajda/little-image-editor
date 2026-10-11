import { describe, expect, it } from 'vitest';
import type { CropRect, Point } from '../../core/document/appTypes';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { drawMermaidFlowchart } from './diagramDrawing';
import { layoutFlowchart } from './diagramLayout';
import { parseFlowchart } from './mermaidFlowchart';

/** A project overview with nested groups, a link to a group and links that skip ranks. */
const ARCHITECTURE = `flowchart TD
  subgraph build [Build]
    B1[build.mjs] ; B2[buildVsCode.mjs]
  end
  subgraph hosts [Hosts]
    WEB[Browser page] ; CHR[Chrome extension] ; VSX[VS Code extension host] --> WV[VS Code webview]
  end
  subgraph app [src/app]
    ED[editor.ts]
    subgraph features [Features]
      F1[files] ; F2[drawing] ; F3[assistant] --> F4[diagrams]
    end
    subgraph core [Core]
      C1[document] ; C2[layers] ; C3[history]
    end
  end
  MCP[assistantServer] -->|OpenImages<br/>bridge| VSX
  B1 --> WEB & CHR
  B2 --> VSX
  WEB & CHR & WV --> ED
  ED --> features
  F1 & F2 & F3 --> C1
  F2 --> C2 & C3
  B1 --> C3`;

const inside = (rect: CropRect, point: Point) =>
	point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;
const contains = (outer: CropRect, inner: CropRect) =>
	inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const overlaps = (a: CropRect, b: CropRect) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Points every few pixels along a straight piece of a link. */
function along(from: Point, to: Point): Point[] {
	const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
	return Array.from({ length: steps + 1 }, (_, step) => ({ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps }));
}

describe('a layered architecture diagram', () => {
	const chart = parseFlowchart(ARCHITECTURE);
	const layout = layoutFlowchart(chart);

	it('links to a whole group instead of inventing a node named after it', () => {
		expect(chart.nodes.map(({ id }) => id)).not.toContain('features');
		expect(chart.links).toContainEqual(expect.objectContaining({ from: 'ED', to: 'features' }));
		const frame = layout.groups.find(({ group }) => group.id === 'features')!.rect;
		const link = layout.links.find(({ link: { to } }) => to === 'features')!;
		expect(link.points.at(-1)!.y).toBeCloseTo(frame.y, 0);
	});

	it('keeps line breaks in link labels, drawn as separate lines', () => {
		expect(chart.links.find(({ from }) => from === 'MCP')?.label).toBe('OpenImages\nbridge');
		const texts = drawMermaidFlowchart(ARCHITECTURE).commands.flatMap((command) =>
			command.kind === AssistantCommandKind.AddText ? [command.text] : [],
		);
		expect(texts).toEqual(expect.arrayContaining(['OpenImages', 'bridge']));
	});

	it('nests inner groups inside their parent without overlapping each other', () => {
		const frame = (id: string) => layout.groups.find(({ group }) => group.id === id)!.rect;
		expect(contains(frame('app'), frame('features'))).toBe(true);
		expect(contains(frame('app'), frame('core'))).toBe(true);
		expect(overlaps(frame('features'), frame('core'))).toBe(false);
		expect(overlaps(frame('build'), frame('hosts'))).toBe(false);
		for (const { group, rect } of layout.groups)
			for (const { node, rect: box } of layout.nodes)
				if (!parseFlowchart(ARCHITECTURE).groups.some((candidate) => candidate.nodeIds.includes(node.id) && isWithin(candidate.id, group.id)))
					expect(overlaps(rect, box)).toBe(false);
	});

	it('never runs a link across a box it does not connect', () => {
		for (const { link, points } of layout.links) {
			const others = layout.nodes.filter(({ node }) => node.id !== link.from && node.id !== link.to);
			for (const [index, point] of points.slice(1).entries())
				for (const step of along(points[index]!, point))
					for (const { node, rect } of others) expect(inside(rect, step), `${link.from}→${link.to} crosses ${node.id}`).toBe(false);
		}
	});

	it('starts a chain next to what it leads to instead of at the top', () => {
		const rank = (id: string) => layout.nodes.find(({ node }) => node.id === id)!.rect.y;
		// The assistant server only leads to the extension host, so it sits just above it.
		expect(rank('MCP')).toBe(rank('B1'));
		expect(rank('F2')).toBeGreaterThan(rank('ED'));
	});

	/** Whether a group is the given group or inside it. */
	function isWithin(group: string, ancestor: string): boolean {
		if (group === ancestor) return true;
		const parent = chart.groups.find(({ id }) => id === group)?.parent;
		return parent ? isWithin(parent, ancestor) : false;
	}
});
