import { describe, expect, it } from 'vitest';
import { LineEnd } from '../annotations/lineEnd';
import { parseClassDiagram } from './mermaidClass';
import { FlowDirection, LinkLine, NodeShape } from './mermaidFlowchart';
import { DiagramSyntaxError } from './mermaidText';

describe('reading a Mermaid class diagram', () => {
	it('reads classes with their attributes and methods in two sections, and annotations above the name', () => {
		const chart = parseClassDiagram(`classDiagram
  direction LR
  class Animal {
    <<abstract>>
    +String name
    +eat(food) bool
    +sleep()$
  }
  Animal : +int age
  Animal : +isMammal()*
  class List~T~
  class Shape["Shape (2D)"]
  <<interface>> Shape`);
		expect(chart.direction).toBe(FlowDirection.LeftRight);
		const byId = new Map(chart.nodes.map((node) => [node.id, node]));
		expect(byId.get('Animal')).toEqual({
			id: 'Animal',
			shape: NodeShape.Class,
			label: ['«abstract»', 'Animal'],
			sections: [
				['+String name', '+int age'],
				['+eat(food) bool', '+sleep()', '+isMammal()'],
			],
		});
		expect(byId.get('List')!.label).toEqual(['List<T>']);
		expect(byId.get('Shape')!.label).toEqual(['«interface»', 'Shape (2D)']);
	});

	it('draws relations with UML ends, the parent or whole first, with multiplicities and labels', () => {
		const chart = parseClassDiagram(`classDiagram
  Animal <|-- Duck
  Fish --|> Animal
  Car "1" *-- "4" Wheel : has
  Pond o-- Duck
  Duck ..> Water : drinks
  Shape <|.. Circle
  Owner --> Car
  Road -- Car`);
		const link = (from: string, to: string) => chart.links.find((candidate) => candidate.from === from && candidate.to === to);
		expect(link('Animal', 'Duck')).toEqual({ from: 'Animal', to: 'Duck', line: LinkLine.Solid, arrow: false, tail: LineEnd.Triangle });
		// Written child first, the parent still comes first, with the triangle at its end.
		expect(link('Animal', 'Fish')).toMatchObject({ tail: LineEnd.Triangle });
		expect(link('Car', 'Wheel')).toEqual({
			from: 'Car',
			to: 'Wheel',
			line: LinkLine.Solid,
			arrow: false,
			tail: LineEnd.FilledDiamond,
			label: 'has',
			tailLabel: '1',
			headLabel: '4',
		});
		expect(link('Pond', 'Duck')).toMatchObject({ tail: LineEnd.Diamond });
		expect(link('Duck', 'Water')).toMatchObject({ line: LinkLine.Dotted, head: LineEnd.OpenArrow, label: 'drinks' });
		expect(link('Shape', 'Circle')).toMatchObject({ line: LinkLine.Dotted, tail: LineEnd.Triangle });
		expect(link('Owner', 'Car')).toMatchObject({ head: LineEnd.OpenArrow });
		expect(link('Road', 'Car')).toEqual({ from: 'Road', to: 'Car', line: LinkLine.Solid, arrow: false });
		expect(chart.nodes.find(({ id }) => id === 'Wheel')).toMatchObject({ shape: NodeShape.Class, sections: [[], []] });
	});

	it('makes namespaces groups, and notes boxes joined to their class', () => {
		const chart = parseClassDiagram(`classDiagram
  namespace Shapes {
    class Square
    class Circle
  }
  note for Square "four equal sides\\nand right angles"
  note "free note"`);
		expect(chart.groups).toEqual([{ id: 'Shapes', label: 'Shapes', nodeIds: ['Square', 'Circle'] }]);
		const notes = chart.nodes.filter(({ shape }) => shape === NodeShape.Note);
		expect(notes.map(({ label }) => label)).toEqual([['four equal sides', 'and right angles'], ['free note']]);
		expect(chart.links).toEqual([{ from: notes[0]!.id, to: 'Square', line: LinkLine.Dotted, arrow: false }]);
	});

	it('accepts styling, and names its mistakes with their lines', () => {
		expect(() => parseClassDiagram('classDiagram\n  class A:::hot\n  classDef hot fill:#f00\n  style A fill:#f00\n  click A href "x"\n  cssClass "A" hot')).not.toThrow();
		const mistakes: [string, string][] = [
			['graph TD\n  A --> B', 'Line 1: A class diagram starts with "classDiagram".'],
			['classDiagram\n  class A {\n  +x', 'Line 3: class A has no closing }.'],
			['classDiagram\n  }', 'Line 2: } without a class or namespace.'],
			['classDiagram\n  A ==> B', 'Line 2: Unknown statement "A ==> B".'],
		];
		for (const [source, message] of mistakes) expect(() => parseClassDiagram(source)).toThrow(new DiagramSyntaxError(message));
	});
});
