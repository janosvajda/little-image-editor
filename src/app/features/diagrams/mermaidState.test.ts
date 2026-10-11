import { describe, expect, it } from 'vitest';
import { FlowDirection, LinkLine, NodeShape } from './mermaidFlowchart';
import { parseStateDiagram } from './mermaidState';
import { DiagramSyntaxError } from './mermaidText';

const TRAFFIC = `stateDiagram-v2
  direction LR
  [*] --> Idle
  Idle --> Loading : fetch
  Loading --> Idle : done<br>or failed
  Loading --> [*]
  state "Waiting for data" as Loading
  Idle : nothing to do
  Idle : waits`;

describe('reading a Mermaid state diagram', () => {
	it('reads states, transitions with labels, descriptions and the direction', () => {
		const chart = parseStateDiagram(TRAFFIC);
		expect(chart.direction).toBe(FlowDirection.LeftRight);
		const byId = new Map(chart.nodes.map((node) => [node.id, node]));
		expect(byId.get('Idle')).toMatchObject({ shape: NodeShape.Rounded, label: ['nothing to do', 'waits'] });
		expect(byId.get('Loading')).toMatchObject({ shape: NodeShape.Rounded, label: ['Waiting for data'] });
		expect(chart.nodes.filter(({ shape }) => shape === NodeShape.Start)).toHaveLength(1);
		expect(chart.nodes.filter(({ shape }) => shape === NodeShape.End)).toHaveLength(1);
		expect(chart.links.map(({ label }) => label)).toEqual([undefined, 'fetch', 'done\nor failed', undefined]);
		expect(chart.links.every(({ arrow, line }) => arrow && line === LinkLine.Solid)).toBe(true);
	});

	it('gives every composite state its own start and end, and makes it a group', () => {
		const chart = parseStateDiagram(`stateDiagram
  [*] --> Active
  state Active {
    [*] --> Running
    Running --> Paused
    Paused --> [*]
  }
  Active --> [*]`);
		const group = chart.groups.find(({ id }) => id === 'Active')!;
		expect(group.label).toBe('Active');
		const inside = new Set(group.nodeIds);
		expect([...inside].filter((id) => chart.nodes.find((node) => node.id === id)?.shape === NodeShape.Start)).toHaveLength(1);
		expect(inside.has('Running') && inside.has('Paused')).toBe(true);
		// The composite is the group, not also a box of its own.
		expect(chart.nodes.some(({ id }) => id === 'Active')).toBe(false);
		expect(chart.nodes.filter(({ shape }) => shape === NodeShape.Start)).toHaveLength(2);
	});

	it('reads forks, joins and choices as bars and small diamonds', () => {
		const chart = parseStateDiagram(`stateDiagram-v2
  state split <<fork>>
  state merge <<join>>
  state decide <<choice>>
  [*] --> split
  split --> A
  split --> B
  A --> merge
  B --> merge
  merge --> decide
  decide --> [*] : done
  decide --> A : again`);
		const shapes = Object.fromEntries(chart.nodes.map(({ id, shape }) => [id, shape]));
		expect(shapes).toMatchObject({ split: NodeShape.Bar, merge: NodeShape.Bar, decide: NodeShape.Choice });
		expect(chart.nodes.find(({ id }) => id === 'decide')!.label).toEqual([]);
	});

	it('joins notes to their states with dotted lines, before them on the left and after them on the right', () => {
		const chart = parseStateDiagram(`stateDiagram-v2
  Ready --> Done
  note right of Ready : shown first
  note left of Done
    two lines
    of text
  end note`);
		const notes = chart.nodes.filter(({ shape }) => shape === NodeShape.Note);
		expect(notes.map(({ label }) => label)).toEqual([['shown first'], ['two lines', 'of text']]);
		const noteLinks = chart.links.filter(({ line }) => line === LinkLine.Dotted);
		expect(noteLinks).toEqual([
			{ from: 'Ready', to: notes[0]!.id, line: LinkLine.Dotted, arrow: false },
			{ from: notes[1]!.id, to: 'Done', line: LinkLine.Dotted, arrow: false },
		]);
	});

	it('accepts styling, comments and separators, and names its mistakes with their lines', () => {
		expect(() => parseStateDiagram('stateDiagram-v2\n  %% a comment\n  classDef hot fill:#f00\n  A:::hot --> B\n  --\n  hide empty description')).not.toThrow();
		const mistakes: [string, string][] = [
			['flowchart LR\n  A --> B', 'Line 1: A state diagram starts with "stateDiagram-v2".'],
			['stateDiagram-v2\n  state A {\n  A --> B', 'Line 3: state A has no closing }.'],
			['stateDiagram-v2\n  }', 'Line 2: } without a composite state.'],
			['stateDiagram-v2\n  A ==> B', 'Line 2: Unknown statement "A ==> B".'],
			['stateDiagram-v2\n  note left of A\n  words', 'Line 3: the note on A has no "end note".'],
		];
		for (const [source, message] of mistakes) expect(() => parseStateDiagram(source)).toThrow(new DiagramSyntaxError(message));
	});
});
