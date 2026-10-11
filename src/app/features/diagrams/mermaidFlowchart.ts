import type { LineEnd } from '../annotations/lineEnd';
import { GraphBuilder, MAX_DIAGRAM_NODES } from './diagramGraph';
import { COMMENT, Cursor, clean, DiagramSyntaxError, lines, statements } from './mermaidText';

/**
 * Reads Mermaid flowcharts (`flowchart` / `graph`), the diagram language AI
 * assistants and developers already write, into a plain graph that the
 * diagram layout turns into editable shapes. Shared by every editor shell;
 * it uses no browser APIs.
 *
 * Supported: directions, node shapes, labelled solid / dotted / thick links
 * with or without arrowheads, `&` lists, chains and nested subgraphs.
 * Styling statements (classDef, style, click…) are accepted and ignored.
 */

export const FlowDirection = { TopDown: 'TB', BottomUp: 'BT', LeftRight: 'LR', RightLeft: 'RL' } as const;
export type FlowDirection = (typeof FlowDirection)[keyof typeof FlowDirection];

export const NodeShape = {
	Box: 'box',
	Rounded: 'rounded',
	Circle: 'circle',
	Diamond: 'diamond',
	/** A state diagram's start: a small filled dot. */
	Start: 'start',
	/** A state diagram's end: a dot in a ring. */
	End: 'end',
	/** A fork or join: a bar across the flow. */
	Bar: 'bar',
	/** A state diagram's choice: a small, empty diamond. */
	Choice: 'choice',
	Note: 'note',
	/** A class: its name, then its members in sections. */
	Class: 'class',
} as const;
export type NodeShape = (typeof NodeShape)[keyof typeof NodeShape];

export const LinkLine = { Solid: 'solid', Dotted: 'dotted', Thick: 'thick' } as const;
export type LinkLine = (typeof LinkLine)[keyof typeof LinkLine];

export interface FlowchartNode {
	readonly id: string;
	/** Lines of the label; a `<br>` starts a new line. */
	readonly label: readonly string[];
	readonly shape: NodeShape;
	/** Sections under the label, such as a class's attributes and methods, each a list of lines. */
	readonly sections?: readonly (readonly string[])[];
}

export interface FlowchartLink {
	/** A node id, or a subgraph id when the link points at the whole group. */
	readonly from: string;
	readonly to: string;
	/** Its lines are separated by newlines; `<br>` in the source starts a new line. */
	readonly label?: string;
	readonly line: LinkLine;
	readonly arrow: boolean;
	/** The end at `to`, when it is not the plain arrowhead `arrow` asks for. */
	readonly head?: LineEnd;
	/** The end at `from`. */
	readonly tail?: LineEnd;
	/** Words written beside each end, such as a relation's multiplicities. */
	readonly tailLabel?: string;
	readonly headLabel?: string;
}

export interface FlowchartGroup {
	readonly id: string;
	readonly label: string;
	/** The nodes declared directly in the group. */
	readonly nodeIds: readonly string[];
	readonly parent?: string;
}

/**
 * A diagram of nodes and links, laid out in layers along its direction: what
 * flowcharts, state diagrams and class diagrams all are once read.
 */
export interface Flowchart {
	readonly direction: FlowDirection;
	readonly nodes: readonly FlowchartNode[];
	readonly links: readonly FlowchartLink[];
	readonly groups: readonly FlowchartGroup[];
}

export class FlowchartSyntaxError extends DiagramSyntaxError {}

/** Diagrams larger than this stop being readable as one picture. */
export const MAX_FLOWCHART_NODES = MAX_DIAGRAM_NODES;

const HEADER = /^(flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?\s*;?$/i;
const IGNORED_STATEMENT = /^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/;
const SUBGRAPH = /^subgraph\s+(.+)$/;
const END = /^end\s*;?$/;
const NODE_ID = /^[\p{L}\p{N}_$]+/u;
/** How a link label keeps its lines apart. */
export const LABEL_LINE_BREAK = '\n';
const LINK_LABEL = /^\|([^|]*)\|/;
/** A link written with its label inside it, such as `-- text -->`, `-. text .->` or `== text ==>`. */
const INLINE_LABEL_LINK = /^(--|==|-\.)\s+(.+?)\s+(-{2,}>|={2,}>|\.-+>|-{3,}|={3,}|\.-+)/;
const LINK = /^(<)?(-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|-{2,}[xo]|={2,}[xo])/;

/** Node shapes by their opening bracket, longest first, with the bracket that closes them. */
const SHAPE_BRACKETS: readonly (readonly [string, string, NodeShape])[] = [
	['(((', ')))', NodeShape.Circle],
	['((', '))', NodeShape.Circle],
	['([', '])', NodeShape.Rounded],
	['[(', ')]', NodeShape.Rounded],
	['[[', ']]', NodeShape.Box],
	['[/', '/]', NodeShape.Box],
	['[\\', '\\]', NodeShape.Box],
	['{{', '}}', NodeShape.Diamond],
	['{', '}', NodeShape.Diamond],
	['(', ')', NodeShape.Rounded],
	['[', ']', NodeShape.Box],
	['>', ']', NodeShape.Box],
];

const DIRECTIONS: Readonly<Record<string, FlowDirection>> = {
	TB: FlowDirection.TopDown,
	TD: FlowDirection.TopDown,
	BT: FlowDirection.BottomUp,
	LR: FlowDirection.LeftRight,
	RL: FlowDirection.RightLeft,
};

/** `direction LR` and the like, which state and class diagrams write on a line of their own. */
export const DIRECTION_STATEMENT = /^direction\s+(TB|TD|BT|LR|RL)\s*$/i;

/** The direction a diagram names with TB, TD, BT, LR or RL, in any case. */
export function flowDirection(code: string): FlowDirection {
	return DIRECTIONS[code.toUpperCase()] ?? FlowDirection.TopDown;
}


/** Files a diagram can be imported from: Mermaid files, and Markdown with a mermaid block. */
export const MERMAID_FILE_ACCEPT = ['.mmd', '.mermaid', '.md', '.markdown'].join(',');
/** A fenced mermaid block in Markdown: its fence, then its code. */
/** Mermaid's optional settings block before the diagram, such as its title. */
const FRONT_MATTER = /^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
const MERMAID_FENCE = /^(`{3,}|~{3,})[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/m;

/** The Mermaid code in a text: its first mermaid block when it is Markdown, otherwise all of it. */
export function mermaidCode(text: string): string {
	return (MERMAID_FENCE.exec(text)?.[2] ?? text).replace(FRONT_MATTER, '');
}

/** Reads a flowchart, from Mermaid code or from Markdown that holds it in a mermaid block. */
export function parseFlowchart(source: string): Flowchart {
	return new FlowchartReader(mermaidCode(source)).read();
}

class FlowchartReader {
	readonly #graph = new GraphBuilder((maximum) => this.fail(`A diagram can have at most ${maximum} nodes`));
	#direction: FlowDirection | null = null;
	#line = 0;

	constructor(private readonly source: string) {}

	read(): Flowchart {
		for (const [index, text] of this.source.split(/\r?\n/).entries()) {
			this.#line = index + 1;
			for (const statement of statements(text))
				if (statement && !statement.startsWith(COMMENT)) this.statement(statement);
		}
		if (!this.#direction) this.fail('A flowchart starts with "flowchart LR" or "graph TD"');
		if (this.#graph.unclosed) this.fail(`subgraph ${this.#graph.unclosed} has no end`);
		return this.#graph.build(this.#direction!);
	}

	private statement(text: string): void {
		if (!this.#direction) {
			const header = HEADER.exec(text);
			if (!header) this.fail('Only Mermaid flowcharts are supported; start with "flowchart LR" or "graph TD"');
			this.#direction = flowDirection(header![2] ?? FlowDirection.TopDown);
			return;
		}
		if (IGNORED_STATEMENT.test(text)) return;
		const subgraph = SUBGRAPH.exec(text);
		if (subgraph) {
			this.openGroup(subgraph[1]!.trim());
			return;
		}
		if (END.test(text)) {
			if (!this.#graph.close()) this.fail('end without a subgraph');
			return;
		}
		this.chain(text);
	}

	private openGroup(header: string): void {
		const reference = new Cursor(header);
		const quoted = reference.quoted();
		const id = quoted ?? reference.match(NODE_ID) ?? this.fail('A subgraph needs a name');
		const titled = reference.rest().match(/^\[(.*)\]$/);
		this.#graph.open(id, clean(titled ? titled[1]! : quoted ?? (reference.rest() || id)));
	}

	/** `A & B --> C -->|label| D`: node lists joined by links. */
	private chain(text: string): void {
		const cursor = new Cursor(text);
		let sources = this.nodeList(cursor);
		while (!cursor.done()) {
			const link = this.link(cursor);
			const targets = this.nodeList(cursor);
			for (const from of sources)
				for (const to of targets)
					this.#graph.link(link.reversed ? { ...link.link, from: to, to: from } : { ...link.link, from, to });
			sources = targets;
		}
	}

	private nodeList(cursor: Cursor): string[] {
		const ids = [this.node(cursor)];
		while (cursor.skip('&')) ids.push(this.node(cursor));
		return ids;
	}

	private node(cursor: Cursor): string {
		cursor.space();
		const id = cursor.match(NODE_ID) ?? this.fail(`Expected a node name at "${cursor.rest()}"`);
		const bracket = SHAPE_BRACKETS.find(([open]) => cursor.startsWith(open));
		if (bracket) {
			const [open, close, shape] = bracket;
			const label = cursor.between(open, close) ?? this.fail(`The label of ${id} is not closed with ${close}`);
			this.#graph.declare({ id, label: lines(label), shape });
		} else this.#graph.name(id, () => ({ id, label: [id], shape: NodeShape.Box }));
		cursor.space();
		return id;
	}

	private link(cursor: Cursor): { link: Omit<FlowchartLink, 'from' | 'to'>; reversed: boolean } {
		cursor.space();
		const inline = cursor.match(INLINE_LABEL_LINK, true);
		const plain = inline ? null : cursor.match(LINK, true);
		const token = inline ?? plain ?? this.fail(`Expected a link such as --> at "${cursor.rest()}"`);
		const parts = (inline ? INLINE_LABEL_LINK : LINK).exec(token)!;
		cursor.space();
		const piped = cursor.match(LINK_LABEL, true);
		const arrowText = inline ? parts[3]! : parts[2]!;
		const label = lines(inline ? parts[2]! : piped ? LINK_LABEL.exec(piped)![1]! : '').join(LABEL_LINE_BREAK);
		return {
			link: {
				...(label ? { label } : {}),
				line: arrowText.includes('.') ? LinkLine.Dotted : arrowText.includes('=') ? LinkLine.Thick : LinkLine.Solid,
				arrow: /[>xo]$/.test(arrowText) || Boolean(!inline && parts[1]),
			},
			reversed: Boolean(!inline && parts[1] && !/[>xo]$/.test(arrowText)),
		};
	}

	private fail(message: string): never {
		throw new FlowchartSyntaxError(`Line ${this.#line}: ${message}.`);
	}
}
