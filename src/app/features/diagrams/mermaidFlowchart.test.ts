import { describe, expect, it } from 'vitest';
import {
	FlowchartSyntaxError,
	FlowDirection,
	LinkLine,
	MAX_FLOWCHART_NODES,
	NodeShape,
	parseFlowchart,
} from './mermaidFlowchart';

describe('reading a Mermaid flowchart', () => {
	it('reads nodes, shapes, links with labels and their line styles', () => {
		const chart = parseFlowchart(`flowchart LR
  %% the user side
  web[Web App] -->|HTTPS| api(API Gateway)
  api -.-> cache((Cache))
  api ==> db[(Postgres)]
  api -- checks --> auth{Auth?}
  db --- backup[["Backup<br>nightly"]]
  classDef blue fill:#00f
  style web fill:#eee`);
		expect(chart.direction).toBe(FlowDirection.LeftRight);
		expect(chart.nodes).toEqual([
			{ id: 'web', label: ['Web App'], shape: NodeShape.Box },
			{ id: 'api', label: ['API Gateway'], shape: NodeShape.Rounded },
			{ id: 'cache', label: ['Cache'], shape: NodeShape.Circle },
			{ id: 'db', label: ['Postgres'], shape: NodeShape.Rounded },
			{ id: 'auth', label: ['Auth?'], shape: NodeShape.Diamond },
			{ id: 'backup', label: ['Backup', 'nightly'], shape: NodeShape.Box },
		]);
		expect(chart.links).toEqual([
			{ from: 'web', to: 'api', label: 'HTTPS', line: LinkLine.Solid, arrow: true },
			{ from: 'api', to: 'cache', line: LinkLine.Dotted, arrow: true },
			{ from: 'api', to: 'db', line: LinkLine.Thick, arrow: true },
			{ from: 'api', to: 'auth', label: 'checks', line: LinkLine.Solid, arrow: true },
			{ from: 'db', to: 'backup', line: LinkLine.Solid, arrow: false },
		]);
	});

	it('reads chains, & lists, semicolons and nested subgraphs', () => {
		const chart = parseFlowchart(`graph TD
  subgraph cloud [Cloud]
    subgraph backend [Back end]
      a & b --> c --> d
    end
    e
  end
  f["Label; with semicolon"] --> a; f --> e`);
		expect(chart.direction).toBe(FlowDirection.TopDown);
		expect(chart.links.map(({ from, to }) => `${from}>${to}`)).toEqual(['a>c', 'b>c', 'c>d', 'f>a', 'f>e']);
		expect(chart.groups).toEqual([
			{ id: 'cloud', label: 'Cloud', nodeIds: ['e'] },
			{ id: 'backend', label: 'Back end', nodeIds: ['a', 'b', 'c', 'd'], parent: 'cloud' },
		]);
		expect(chart.nodes.find(({ id }) => id === 'f')?.label).toEqual(['Label; with semicolon']);
	});

	it('defaults to top-down and keeps a node first declared without a label', () => {
		const chart = parseFlowchart('graph\n  a --> b[Bee]\n  b --> a');
		expect(chart.direction).toBe(FlowDirection.TopDown);
		expect(chart.nodes.map(({ label }) => label)).toEqual([['a'], ['Bee']]);
	});

	it.each([
		['sequenceDiagram\n  A->>B: hi', 'Line 1: Only Mermaid flowcharts are supported; start with "flowchart LR" or "graph TD".'],
		['flowchart LR\n  a --> ', 'Line 2: Expected a node name at "".'],
		['flowchart LR\n  a[open --> b', 'Line 2: The label of a is not closed with ].'],
		['flowchart LR\n  a ~~ b', 'Line 2: Expected a link such as --> at "~~ b".'],
		['flowchart LR\n  end', 'Line 2: end without a subgraph.'],
		['flowchart LR\n  subgraph x\n  a', 'Line 3: subgraph x has no end.'],
		['', 'Line 1: A flowchart starts with "flowchart LR" or "graph TD".'],
	])('refuses %j', (source, message) => {
		expect(() => parseFlowchart(source)).toThrow(new FlowchartSyntaxError(message));
	});

	it('refuses a diagram too large to read', () => {
		const nodes = Array.from({ length: MAX_FLOWCHART_NODES + 1 }, (_, index) => `n${index}`).join('\n');
		expect(() => parseFlowchart(`graph TD\n${nodes}`)).toThrow(`at most ${MAX_FLOWCHART_NODES} nodes`);
	});
});
