import { LineEnd } from '../annotations/lineEnd';
import { GraphBuilder } from './diagramGraph';
import { type Flowchart, FlowDirection, type FlowchartLink, type FlowchartNode, LinkLine, NodeShape, DIRECTION_STATEMENT, flowDirection } from './mermaidFlowchart';
import { clean, lines, type SourceStatement, sourceStatements, syntaxError } from './mermaidText';

/**
 * Reads Mermaid class diagrams (`classDiagram`) into the same graph as
 * flowcharts: a class is a box with its name, attributes and methods in
 * sections, a namespace is a group, and each relation is a line with UML ends:
 * a hollow triangle for inheritance and realisation, diamonds for composition
 * and aggregation, open arrows for associations and dependencies.
 */

export const CLASS_HEADER = /^classDiagram(-v2)?\s*$/i;
const NAME = '[\\p{L}\\p{N}_$.~]+';
const CLASS = new RegExp(`^class\\s+(${NAME})(?:\\s*\\["([^"]*)"\\])?\\s*(?:<<([^>]+)>>)?\\s*(\\{)?\\s*$`, 'u');
const NAMESPACE = new RegExp(`^namespace\\s+(${NAME})\\s*\\{\\s*$`, 'u');
const CLOSE = /^\}\s*$/;
const ANNOTATION = new RegExp(`^<<([^>]+)>>\\s*(${NAME})?\\s*$`, 'u');
const MEMBER = new RegExp(`^(${NAME})\\s*:\\s*(.+)$`, 'u');
/** `A "1" <|-- "many" B : label`: two classes, optional multiplicities, ends and a line between. */
const RELATION = new RegExp(
	`^(${NAME})\\s*(?:"([^"]*)"\\s*)?(<\\||\\*|o|<)?(--|\\.\\.)(\\|>|\\*|o|>)?\\s*(?:"([^"]*)"\\s*)?(${NAME})\\s*(?::\\s*(.*))?$`,
	'u',
);
const NOTE = new RegExp(`^note\\s+(?:for\\s+(${NAME})\\s+)?"([^"]*)"\\s*$`, 'u');
/** Styling and interaction statements; unlike in flowcharts, `class` declares a class here. */
const IGNORED = /^(classDef|style|linkStyle|click|cssClass|callback|link|accTitle|accDescr)\b/;
const STYLE_SUFFIX = /:::[\p{L}\p{N}_-]+/gu;
/** Generic types are written between tildes: `List~int~` reads `List<int>`. */
const GENERIC = /~([^~]*)~/g;
/** Classifier marks after a member: `$` static, `*` abstract. */
const CLASSIFIER = /[$*]$/;
const METHOD = '(';
/** A note's text starts a new line at a written \n. */
const ESCAPED_LINE_BREAK = /\\n/g;
const LEFT_ENDS: Readonly<Record<string, LineEnd>> = { '<|': LineEnd.Triangle, '*': LineEnd.FilledDiamond, o: LineEnd.Diamond, '<': LineEnd.OpenArrow };
const RIGHT_ENDS: Readonly<Record<string, LineEnd>> = { '|>': LineEnd.Triangle, '*': LineEnd.FilledDiamond, o: LineEnd.Diamond, '>': LineEnd.OpenArrow };
/** Ends that mark the parent or the whole, which is placed first. */
const OWNER_ENDS: ReadonlySet<LineEnd> = new Set([LineEnd.Triangle, LineEnd.Diamond, LineEnd.FilledDiamond]);
const OpenBlock = { Class: 'class', Namespace: 'namespace' } as const;
type OpenBlock = (typeof OpenBlock)[keyof typeof OpenBlock];

export function parseClassDiagram(source: string): Flowchart {
	return new ClassReader(source).read();
}

class ClassReader {
	readonly #graph: GraphBuilder;
	readonly #annotations = new Map<string, string[]>();
	readonly #titles = new Map<string, string>();
	readonly #blocks: { kind: OpenBlock; id: string }[] = [];
	#direction: FlowDirection = FlowDirection.TopDown;
	#notes = 0;
	#line = 0;

	constructor(private readonly source: string) {
		this.#graph = new GraphBuilder((maximum) => this.fail(`A diagram can have at most ${maximum} classes`));
	}

	read(): Flowchart {
		const [header, ...rest] = sourceStatements(this.source);
		if (!header || !CLASS_HEADER.test(header.text)) throw syntaxError(header?.line ?? 1, 'A class diagram starts with "classDiagram"');
		for (const statement of rest) this.statement(statement);
		const open = this.#blocks.at(-1);
		if (open) this.fail(`${open.kind} ${open.id} has no closing }`);
		return this.#graph.build(this.#direction);
	}

	private statement({ text: raw, line }: SourceStatement): void {
		this.#line = line;
		const text = raw.replace(STYLE_SUFFIX, '');
		if (IGNORED.test(text)) return;
		if (CLOSE.test(text)) return this.close();
		const inClass = this.#blocks.at(-1);
		if (inClass?.kind === OpenBlock.Class) return this.bodyLine(inClass.id, text);
		const direction = DIRECTION_STATEMENT.exec(text);
		if (direction) {
			this.#direction = flowDirection(direction[1]!);
			return;
		}
		this.declaration(text);
	}

	private declaration(text: string): void {
		const namespace = NAMESPACE.exec(text);
		if (namespace) {
			this.#graph.open(namespace[1]!, namespace[1]!);
			this.#blocks.push({ kind: OpenBlock.Namespace, id: namespace[1]! });
			return;
		}
		const declared = CLASS.exec(text);
		if (declared) return this.declareClass(declared);
		const relation = RELATION.exec(text);
		if (relation) return this.relation(relation);
		const annotation = ANNOTATION.exec(text);
		if (annotation?.[2]) return this.annotate(annotation[2], annotation[1]!);
		const note = NOTE.exec(text);
		if (note) return this.note(note[1], note[2]!);
		const member = MEMBER.exec(text);
		if (member) return this.addMember(member[1]!, member[2]!);
		this.fail(`Unknown statement "${text}"`);
	}

	private close(): void {
		const block = this.#blocks.pop();
		if (!block) this.fail('} without a class or namespace');
		if (block!.kind === OpenBlock.Namespace) this.#graph.close();
	}

	private bodyLine(id: string, text: string): void {
		const annotation = ANNOTATION.exec(text);
		if (annotation && !annotation[2]) this.annotate(id, annotation[1]!);
		else this.addMember(id, text);
	}

	private declareClass([, name, title, annotation, opens]: RegExpExecArray): void {
		const id = this.classId(name!);
		if (title) this.#titles.set(id, title);
		else if (id !== name) this.#titles.set(id, display(name!));
		this.classNode(id);
		if (annotation) this.annotate(id, annotation);
		else this.refresh(id);
		if (opens) this.#blocks.push({ kind: OpenBlock.Class, id });
	}

	private relation([, left, leftLabel, leftEnd, line, rightEnd, rightLabel, right, label]: RegExpExecArray): void {
		const from = this.classNode(this.classId(left!));
		const to = this.classNode(this.classId(right!));
		const tail = leftEnd ? LEFT_ENDS[leftEnd]! : LineEnd.None;
		const head = rightEnd ? RIGHT_ENDS[rightEnd]! : LineEnd.None;
		// The parent or the whole goes first, so a hierarchy reads from the top.
		const swap = OWNER_ENDS.has(head) && !OWNER_ENDS.has(tail);
		const link: FlowchartLink = {
			from: swap ? to : from,
			to: swap ? from : to,
			line: line === '..' ? LinkLine.Dotted : LinkLine.Solid,
			arrow: false,
			...ends(swap ? head : tail, swap ? tail : head),
			...(label?.trim() ? { label: lines(label).join('\n') } : {}),
			...labels(swap ? rightLabel : leftLabel, swap ? leftLabel : rightLabel),
		};
		this.#graph.link(link);
	}

	private annotate(id: string, annotation: string): void {
		this.classNode(id);
		const annotations = this.#annotations.get(id) ?? [];
		annotations.push(`«${annotation.trim()}»`);
		this.#annotations.set(id, annotations);
		this.refresh(id);
	}

	private addMember(id: string, member: string): void {
		const node = this.#graph.node(this.classNode(this.classId(id)))!;
		const [attributes = [], methods = []] = node.sections ?? [];
		const text = display(member.trim()).replace(CLASSIFIER, '');
		if (!text) return;
		const sections = text.includes(METHOD) ? [attributes, [...methods, text]] : [[...attributes, text], methods];
		this.#graph.declare({ ...node, sections });
	}

	/** A free note, or a note joined to its class by a dotted line. */
	private note(id: string | undefined, text: string): void {
		const note = `note:${++this.#notes}`;
		this.#graph.declare({ id: note, label: lines(text.replace(ESCAPED_LINE_BREAK, '<br>')), shape: NodeShape.Note });
		if (id) this.#graph.link({ from: note, to: this.classNode(this.classId(id)), line: LinkLine.Dotted, arrow: false });
	}

	/** A class's node, made when it is first named. */
	private classNode(id: string): string {
		this.#graph.name(id, () => ({ id, label: this.title(id), shape: NodeShape.Class, sections: [[], []] }));
		return id;
	}

	/** Declares the class again with its current title and annotations. */
	private refresh(id: string): void {
		const node: FlowchartNode = this.#graph.node(id)!;
		this.#graph.declare({ ...node, label: this.title(id) });
	}

	private title(id: string): string[] {
		return [...(this.#annotations.get(id) ?? []), clean(this.#titles.get(id) ?? id)];
	}

	/** A class is named without its generic type. */
	private classId(name: string): string {
		return name.replace(GENERIC, '');
	}

	private fail(message: string): never {
		throw syntaxError(this.#line, message);
	}
}

function ends(tail: LineEnd, head: LineEnd): Pick<FlowchartLink, 'head' | 'tail'> {
	return { ...(head !== LineEnd.None ? { head } : {}), ...(tail !== LineEnd.None ? { tail } : {}) };
}

function labels(tailLabel: string | undefined, headLabel: string | undefined): Pick<FlowchartLink, 'tailLabel' | 'headLabel'> {
	return { ...(tailLabel ? { tailLabel } : {}), ...(headLabel ? { headLabel } : {}) };
}

/** Generic types shown in angle brackets. */
function display(text: string): string {
	return text.replace(GENERIC, '<$1>');
}
