import { CLASS_HEADER, parseClassDiagram } from './mermaidClass';
import { type Flowchart, mermaidCode, parseFlowchart } from './mermaidFlowchart';
import { parseSequenceDiagram, SEQUENCE_HEADER, type SequenceDiagram } from './mermaidSequence';
import { parseStateDiagram, STATE_HEADER } from './mermaidState';
import { sourceStatements, syntaxError } from './mermaidText';

/**
 * Reads any supported Mermaid diagram, by its first statement. Flowcharts,
 * state and class diagrams are graphs, laid out in layers; a sequence diagram
 * is laid out in columns and time.
 */

export const MermaidDiagramKind = { Graph: 'graph', Sequence: 'sequence' } as const;

export type MermaidDiagram =
	| Readonly<{ kind: typeof MermaidDiagramKind.Graph; chart: Flowchart }>
	| Readonly<{ kind: typeof MermaidDiagramKind.Sequence; diagram: SequenceDiagram }>;

const FLOWCHART_HEADER = /^(flowchart|graph)\b/i;
const SUPPORTED = 'Supported Mermaid diagrams start with flowchart, graph, stateDiagram-v2, classDiagram or sequenceDiagram';

/** The readers of graphs, by the header they start with. */
const GRAPH_READERS: readonly (readonly [RegExp, (source: string) => Flowchart])[] = [
	[FLOWCHART_HEADER, parseFlowchart],
	[STATE_HEADER, parseStateDiagram],
	[CLASS_HEADER, parseClassDiagram],
];

export function parseMermaid(source: string): MermaidDiagram {
	const code = mermaidCode(source);
	const [header] = sourceStatements(code);
	if (header && SEQUENCE_HEADER.test(header.text)) return { kind: MermaidDiagramKind.Sequence, diagram: parseSequenceDiagram(code) };
	const reader = GRAPH_READERS.find(([pattern]) => header && pattern.test(header.text))?.[1];
	if (!reader) throw syntaxError(header?.line ?? 1, SUPPORTED);
	return { kind: MermaidDiagramKind.Graph, chart: reader(code) };
}
