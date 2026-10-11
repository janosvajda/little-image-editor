import { LineEnd } from '../annotations/lineEnd';
import { MAX_DIAGRAM_NODES } from './diagramGraph';
import { clean, lines, type SourceStatement, STYLING_STATEMENT, sourceStatements, syntaxError } from './mermaidText';

/**
 * Reads Mermaid sequence diagrams (`sequenceDiagram`): participants and
 * actors, messages in order with their line and end styles, activations,
 * notes, and the loop / alt / opt / par / critical / break / rect frames
 * around messages. Shared by every editor shell; it uses no browser APIs.
 */

export const SEQUENCE_HEADER = /^sequenceDiagram\s*$/i;

export const ParticipantKind = { Participant: 'participant', Actor: 'actor' } as const;
export type ParticipantKind = (typeof ParticipantKind)[keyof typeof ParticipantKind];

export interface SequenceParticipant {
	readonly id: string;
	readonly label: readonly string[];
	readonly kind: ParticipantKind;
}

export const SequenceEventKind = {
	Message: 'message',
	Note: 'note',
	Activate: 'activate',
	Deactivate: 'deactivate',
	FrameStart: 'frameStart',
	FrameSection: 'frameSection',
	FrameEnd: 'frameEnd',
} as const;

export const NotePosition = { LeftOf: 'left of', RightOf: 'right of', Over: 'over' } as const;
export type NotePosition = (typeof NotePosition)[keyof typeof NotePosition];

export const FrameKind = {
	Loop: 'loop',
	Alt: 'alt',
	Opt: 'opt',
	Par: 'par',
	Critical: 'critical',
	Break: 'break',
	/** A highlighted background, without a title. */
	Rect: 'rect',
} as const;
export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

export interface SequenceMessage {
	readonly kind: typeof SequenceEventKind.Message;
	readonly from: string;
	readonly to: string;
	readonly text: readonly string[];
	readonly dashed: boolean;
	readonly head: LineEnd;
	readonly tail: LineEnd;
	/** `+` before the target: the target becomes active. */
	readonly activates: boolean;
	/** `-` before the target: the sender stops being active. */
	readonly deactivates: boolean;
}

export interface SequenceNote {
	readonly kind: typeof SequenceEventKind.Note;
	readonly position: NotePosition;
	/** One participant, or the two a note over several spans. */
	readonly participants: readonly string[];
	readonly text: readonly string[];
}

export type SequenceEvent =
	| SequenceMessage
	| SequenceNote
	| Readonly<{ kind: typeof SequenceEventKind.Activate | typeof SequenceEventKind.Deactivate; participant: string }>
	| Readonly<{ kind: typeof SequenceEventKind.FrameStart; frame: FrameKind; label: string }>
	| Readonly<{ kind: typeof SequenceEventKind.FrameSection; label: string }>
	| Readonly<{ kind: typeof SequenceEventKind.FrameEnd }>;

export interface SequenceDiagram {
	readonly participants: readonly SequenceParticipant[];
	readonly events: readonly SequenceEvent[];
}

const NAME = '[\\p{L}\\p{N}_$.]+';
const PARTICIPANT = new RegExp(`^(?:create\\s+)?(participant|actor)\\s+(${NAME}|"[^"]+")(?:\\s+as\\s+(.+))?$`, 'iu');
/** Message arrows, longest first so `-->>` is not read as `-->`. */
const ARROWS: readonly (readonly [string, Readonly<{ dashed: boolean; head: LineEnd; tail: LineEnd }>])[] = [
	['<<-->>', { dashed: true, head: LineEnd.Arrow, tail: LineEnd.Arrow }],
	['<<->>', { dashed: false, head: LineEnd.Arrow, tail: LineEnd.Arrow }],
	['-->>', { dashed: true, head: LineEnd.Arrow, tail: LineEnd.None }],
	['->>', { dashed: false, head: LineEnd.Arrow, tail: LineEnd.None }],
	['--x', { dashed: true, head: LineEnd.Cross, tail: LineEnd.None }],
	['-x', { dashed: false, head: LineEnd.Cross, tail: LineEnd.None }],
	['--)', { dashed: true, head: LineEnd.OpenArrow, tail: LineEnd.None }],
	['-)', { dashed: false, head: LineEnd.OpenArrow, tail: LineEnd.None }],
	['-->', { dashed: true, head: LineEnd.None, tail: LineEnd.None }],
	['->', { dashed: false, head: LineEnd.None, tail: LineEnd.None }],
];
const MESSAGE = new RegExp(
	`^(${NAME})\\s*(${ARROWS.map(([arrow]) => arrow.replace(/[()]/g, '\\$&')).join('|')})\\s*([+-])?\\s*(${NAME})\\s*(?::(.*))?$`,
	'u',
);
const NOTE = new RegExp(`^note\\s+(left of|right of|over)\\s+(${NAME})(?:\\s*,\\s*(${NAME}))?\\s*:(.*)$`, 'iu');
const ACTIVATION = new RegExp(`^(activate|deactivate)\\s+(${NAME})\\s*$`, 'iu');
const FRAME_START = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i;
const FRAME_SECTION = /^(else|and|option)\b\s*(.*)$/i;
const BOX = /^box\b/i;
const END = /^end\s*$/i;
const AUTONUMBER = /^autonumber\b/i;
/** Statements that change nothing drawn: titles, participant links and removal. */
const IGNORED = /^(title|destroy|links?|properties|details)\b/i;
const ACTIVATE = '+';
const DEACTIVATE = '-';
/** A sequence diagram has room for several steps per participant a graph has nodes. */
const STEPS_PER_NODE = 4;
const MAX_EVENTS = MAX_DIAGRAM_NODES * STEPS_PER_NODE;
const OpenBlock = { Frame: 'frame', Box: 'box' } as const;
type OpenBlock = (typeof OpenBlock)[keyof typeof OpenBlock];

export function parseSequenceDiagram(source: string): SequenceDiagram {
	return new SequenceReader(source).read();
}

class SequenceReader {
	readonly #participants = new Map<string, SequenceParticipant>();
	readonly #events: SequenceEvent[] = [];
	readonly #blocks: OpenBlock[] = [];
	#numbered = false;
	#messages = 0;
	#line = 0;

	constructor(private readonly source: string) {}

	read(): SequenceDiagram {
		const [header, ...rest] = sourceStatements(this.source);
		if (!header || !SEQUENCE_HEADER.test(header.text)) throw syntaxError(header?.line ?? 1, 'A sequence diagram starts with "sequenceDiagram"');
		for (const statement of rest) this.statement(statement);
		if (this.#blocks.length) this.fail(`a ${this.#blocks.at(-1)} has no end`);
		return { participants: [...this.#participants.values()], events: this.#events };
	}

	private statement({ text, line }: SourceStatement): void {
		this.#line = line;
		if (STYLING_STATEMENT.test(text) || IGNORED.test(text)) return;
		if (AUTONUMBER.test(text)) {
			this.#numbered = true;
			return;
		}
		const participant = PARTICIPANT.exec(text);
		if (participant) return this.participant(participant);
		const message = MESSAGE.exec(text);
		if (message) return this.message(message);
		const note = NOTE.exec(text);
		if (note) return this.note(note);
		this.control(text);
	}

	/** Activations and the frames and boxes around messages. */
	private control(text: string): void {
		const activation = ACTIVATION.exec(text);
		if (activation) {
			const kind = activation[1]!.toLowerCase() === SequenceEventKind.Activate ? SequenceEventKind.Activate : SequenceEventKind.Deactivate;
			return this.add({ kind, participant: this.named(activation[2]!) });
		}
		const frame = FRAME_START.exec(text);
		if (frame) {
			this.#blocks.push(OpenBlock.Frame);
			return this.add({ kind: SequenceEventKind.FrameStart, frame: frame[1]!.toLowerCase() as FrameKind, label: clean(frame[2] ?? '') });
		}
		const section = FRAME_SECTION.exec(text);
		if (section) {
			if (this.#blocks.at(-1) !== OpenBlock.Frame) this.fail(`${section[1]} outside alt, par or critical`);
			return this.add({ kind: SequenceEventKind.FrameSection, label: clean(section[2] ?? '') });
		}
		if (BOX.test(text)) {
			this.#blocks.push(OpenBlock.Box);
			return;
		}
		if (END.test(text)) {
			const block = this.#blocks.pop();
			if (!block) this.fail('end without a frame or box');
			if (block === OpenBlock.Frame) this.add({ kind: SequenceEventKind.FrameEnd });
			return;
		}
		this.fail(`Unknown statement "${text}"`);
	}

	private participant([, kind, name, alias]: RegExpExecArray): void {
		const id = clean(name!);
		this.#participants.set(id, { id, label: lines(alias ?? id), kind: kind!.toLowerCase() as ParticipantKind });
	}

	private message([, from, arrow, activation, to, text]: RegExpExecArray): void {
		const style = ARROWS.find(([token]) => token === arrow)![1];
		const words = lines(text ?? '');
		const number = this.#numbered ? `${++this.#messages}. ` : '';
		this.add({
			kind: SequenceEventKind.Message,
			from: this.named(from!),
			to: this.named(to!),
			text: number && words.length ? [`${number}${words[0]}`, ...words.slice(1)] : number ? [number.trim()] : words,
			...style,
			activates: activation === ACTIVATE,
			deactivates: activation === DEACTIVATE,
		});
	}

	private note([, position, first, second, text]: RegExpExecArray): void {
		this.add({
			kind: SequenceEventKind.Note,
			position: position!.toLowerCase() as NotePosition,
			participants: [this.named(first!), ...(second ? [this.named(second)] : [])],
			text: lines(text ?? ''),
		});
	}

	/** A participant named first in a message joins at the end of the row. */
	private named(id: string): string {
		if (!this.#participants.has(id)) this.#participants.set(id, { id, label: [id], kind: ParticipantKind.Participant });
		return id;
	}

	private add(event: SequenceEvent): void {
		this.#events.push(event);
		if (this.#events.length > MAX_EVENTS) this.fail(`A sequence diagram can have at most ${MAX_EVENTS} steps`);
	}

	private fail(message: string): never {
		throw syntaxError(this.#line, message);
	}
}
