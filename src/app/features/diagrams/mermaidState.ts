import { GraphBuilder } from './diagramGraph';
import { type Flowchart, FlowDirection, LinkLine, NodeShape, DIRECTION_STATEMENT, flowDirection } from './mermaidFlowchart';
import { clean, lines, type SourceStatement, STYLING_STATEMENT, sourceStatements, syntaxError } from './mermaidText';

/**
 * Reads Mermaid state diagrams (`stateDiagram` / `stateDiagram-v2`) into the
 * same graph as flowcharts: states are boxes, `[*]` is a start dot or an end
 * ring in each composite state, a composite state is a group, forks and joins
 * are bars, choices small diamonds, and notes are linked with dotted lines.
 */

export const STATE_HEADER = /^stateDiagram(-v2)?\s*$/i;
/** `state "Description" as Id`, `state Id`, either opening a composite with `{`, or with a <<kind>>. */
const STATE = /^state\s+(?:"([^"]*)"\s+as\s+)?([\p{L}\p{N}_$.-]+)(?:\s+as\s+"([^"]*)")?\s*(<<(fork|join|choice)>>)?\s*(\{)?\s*$/iu;
const CLOSE = /^\}\s*$/;
const TRANSITION = /^(\[\*\]|[\p{L}\p{N}_$.-]+)\s*-->\s*(\[\*\]|[\p{L}\p{N}_$.-]+)\s*(?::\s*(.*))?$/u;
const DESCRIPTION = /^([\p{L}\p{N}_$.-]+)\s*:\s*(.+)$/u;
const NOTE = /^note\s+(left|right)\s+of\s+([\p{L}\p{N}_$.-]+)\s*(?::\s*(.*))?$/iu;
const END_NOTE = /^end\s+note\s*$/i;
const BARE_STATE = /^([\p{L}\p{N}_$.-]+)$/u;
/** The concurrency separator inside a composite state, and the setting that hides empty descriptions. */
const IGNORED = /^(--|hide\s+empty\s+description)\s*$/i;
const PSEUDO_STATE = '[*]';
/** A style class attached to a state, such as `Moving:::alert`. */
const STYLE_SUFFIX = /:::[\p{L}\p{N}_-]+/gu;
const ROOT_SCOPE = '';
const NoteSide = { Left: 'left', Right: 'right' } as const;
type NoteSide = (typeof NoteSide)[keyof typeof NoteSide];
const SPECIAL_SHAPES: Readonly<Record<string, NodeShape>> = { fork: NodeShape.Bar, join: NodeShape.Bar, choice: NodeShape.Choice };

interface OpenNote {
	readonly side: NoteSide;
	readonly state: string;
	readonly lines: string[];
}

export function parseStateDiagram(source: string): Flowchart {
	return new StateReader(source).read();
}

class StateReader {
	readonly #graph: GraphBuilder;
	/** Descriptions given with `Id : text`, which become the state's label. */
	readonly #descriptions = new Map<string, string[]>();
	#direction: FlowDirection = FlowDirection.TopDown;
	#note: OpenNote | null = null;
	#notes = 0;
	#line = 0;

	constructor(private readonly source: string) {
		this.#graph = new GraphBuilder((maximum) => this.fail(`A diagram can have at most ${maximum} states`));
	}

	read(): Flowchart {
		const [header, ...rest] = sourceStatements(this.source);
		if (!header || !STATE_HEADER.test(header.text)) throw syntaxError(header?.line ?? 1, 'A state diagram starts with "stateDiagram-v2"');
		for (const statement of rest) this.statement(statement);
		if (this.#note) this.fail(`the note on ${this.#note.state} has no "end note"`);
		if (this.#graph.unclosed) this.fail(`state ${this.#graph.unclosed} has no closing }`);
		return this.#graph.build(this.#direction);
	}

	private statement({ text: raw, line }: SourceStatement): void {
		this.#line = line;
		const text = raw.replace(STYLE_SUFFIX, '');
		if (this.#note) {
			if (END_NOTE.test(text)) this.addNote(this.#note);
			else this.#note.lines.push(...lines(raw));
			return;
		}
		if (STYLING_STATEMENT.test(text) || IGNORED.test(text)) return;
		const direction = DIRECTION_STATEMENT.exec(text);
		if (direction) {
			if (!this.#graph.openGroup) this.#direction = flowDirection(direction[1]!);
			return;
		}
		if (CLOSE.test(text)) {
			if (!this.#graph.close()) this.fail('} without a composite state');
			return;
		}
		this.content(text);
	}

	private content(text: string): void {
		const state = STATE.exec(text);
		if (state) return this.state(state);
		const transition = TRANSITION.exec(text);
		if (transition) return this.transition(transition[1]!, transition[2]!, transition[3]);
		const note = NOTE.exec(text);
		if (note) return this.note(note[1]!.toLowerCase() as NoteSide, note[2]!, note[3]);
		const description = DESCRIPTION.exec(text);
		if (description) return this.describe(description[1]!, description[2]!);
		const bare = BARE_STATE.exec(text);
		if (!bare) this.fail(`Unknown statement "${text}"`);
		this.named(bare[1]!);
	}

	private state([, quoted, id, aliasLabel, , kind, opens]: RegExpExecArray): void {
		const label = quoted ?? aliasLabel;
		if (opens) {
			this.#graph.open(id!, clean(label ?? id!));
			return;
		}
		const shape = kind ? SPECIAL_SHAPES[kind.toLowerCase()]! : NodeShape.Rounded;
		if (label) this.#descriptions.set(id!, [clean(label)]);
		this.#graph.declare({ id: id!, label: shape === NodeShape.Rounded ? this.labelOf(id!) : [], shape });
	}

	private transition(from: string, to: string, label: string | undefined): void {
		const source = from === PSEUDO_STATE ? this.pseudoState(NodeShape.Start) : this.named(from);
		const target = to === PSEUDO_STATE ? this.pseudoState(NodeShape.End) : this.named(to);
		const words = label ? lines(label).join('\n') : '';
		this.#graph.link({ from: source, to: target, line: LinkLine.Solid, arrow: true, ...(words ? { label: words } : {}) });
	}

	/** The start or end of the composite state open here, or of the whole diagram. */
	private pseudoState(shape: typeof NodeShape.Start | typeof NodeShape.End): string {
		const id = `${PSEUDO_STATE}${shape}:${this.#graph.openGroup ?? ROOT_SCOPE}`;
		this.#graph.name(id, () => ({ id, label: [], shape }));
		return id;
	}

	private named(id: string): string {
		this.#graph.name(id, () => ({ id, label: this.labelOf(id), shape: NodeShape.Rounded }));
		return id;
	}

	private describe(id: string, description: string): void {
		const descriptions = this.#descriptions.get(id) ?? [];
		descriptions.push(...lines(description));
		this.#descriptions.set(id, descriptions);
		this.named(id);
		this.#graph.declare({ ...this.#graph.node(id)!, label: descriptions });
	}

	private note(side: NoteSide, state: string, text: string | undefined): void {
		this.named(state);
		const note = { side, state, lines: text ? lines(text) : [] };
		if (text) this.addNote(note);
		else this.#note = note;
	}

	/** A note sits before its state when on its left, after it when on its right, joined by a dotted line. */
	private addNote({ side, state, lines: noteLines }: OpenNote): void {
		this.#note = null;
		const id = `note:${++this.#notes}`;
		this.#graph.declare({ id, label: noteLines, shape: NodeShape.Note });
		const [from, to] = side === NoteSide.Left ? [id, state] : [state, id];
		this.#graph.link({ from, to, line: LinkLine.Dotted, arrow: false });
	}

	private labelOf(id: string): string[] {
		return this.#descriptions.get(id) ?? [id];
	}

	private fail(message: string): never {
		throw syntaxError(this.#line, message);
	}
}
