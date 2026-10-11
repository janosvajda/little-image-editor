import type { CropRect, Point } from '../../core/document/appTypes';
import { DiagramMetrics, textSize } from './diagramLayout';
import {
	type FrameKind,
	NotePosition,
	ParticipantKind,
	type SequenceDiagram,
	type SequenceEvent,
	SequenceEventKind,
	type SequenceMessage,
	type SequenceNote,
	type SequenceParticipant,
} from './mermaidSequence';

/**
 * Places a sequence diagram: participants in a row, each with a lifeline
 * down to its copy at the bottom, and every step below the one before.
 * Columns move apart until every message label, self message and note fits
 * between them. Pure geometry with the editor's text metrics.
 */

export const SequenceMetrics = {
	ColumnGap: 48,
	/** The space above a message's line for its label, and below it to the next step. */
	LabelGap: 6,
	StepGap: 18,
	SelfLoopWidth: 36,
	SelfLoopHeight: 26,
	ActivationWidth: 12,
	/** A nested activation sits this far right of the one it is in. */
	ActivationNest: 6,
	NotePadding: 8,
	NoteGap: 12,
	FramePadding: 12,
	FrameTitle: 26,
	FrameGap: 12,
	/** An actor's stick figure, above its name. */
	ActorFigure: 46,
	EndGap: 24,
} as const;

export interface PlacedParticipant {
	readonly participant: SequenceParticipant;
	readonly header: CropRect;
	readonly footer: CropRect;
	readonly lifeline: Readonly<{ x: number; top: number; bottom: number }>;
}

export interface PlacedMessage {
	readonly message: SequenceMessage;
	readonly points: readonly Point[];
	/** The middle of the label above a message's line, or the left of a self message's label. */
	readonly label: Point;
	readonly self: boolean;
}

export interface PlacedNote {
	readonly note: SequenceNote;
	readonly rect: CropRect;
}

export interface PlacedFrame {
	readonly frame: FrameKind;
	readonly label: string;
	readonly rect: CropRect;
	/** Where an alt's `else` or a par's `and` divides the frame, with its label. */
	readonly sections: readonly Readonly<{ y: number; label: string }>[];
}

export interface SequenceLayout {
	readonly width: number;
	readonly height: number;
	readonly participants: readonly PlacedParticipant[];
	readonly activations: readonly CropRect[];
	readonly messages: readonly PlacedMessage[];
	readonly notes: readonly PlacedNote[];
	/** Outer frames first, so inner ones are drawn over them. */
	readonly frames: readonly PlacedFrame[];
}

const HALF = 2;

interface Extent {
	left: number;
	right: number;
}

interface OpenFrame {
	readonly frame: FrameKind;
	readonly label: string;
	readonly top: number;
	readonly sections: { y: number; label: string }[];
	extent: Extent | null;
	readonly order: number;
}

export function layoutSequence(diagram: SequenceDiagram): SequenceLayout {
	return new SequenceLayoutBuilder(diagram).layout();
}

class SequenceLayoutBuilder {
	readonly #index: ReadonlyMap<string, number>;
	readonly #boxes: readonly Readonly<{ width: number; height: number }>[];
	readonly #centres: number[];
	readonly #active = new Map<string, number[]>();
	readonly #activations: CropRect[] = [];
	readonly #messages: PlacedMessage[] = [];
	readonly #notes: PlacedNote[] = [];
	readonly #frames: (PlacedFrame & { order: number })[] = [];
	readonly #open: OpenFrame[] = [];
	#y = 0;

	constructor(private readonly diagram: SequenceDiagram) {
		this.#index = new Map(diagram.participants.map(({ id }, index) => [id, index]));
		this.#boxes = diagram.participants.map(participantSize);
		this.#centres = this.columns();
	}

	layout(): SequenceLayout {
		const headerHeight = Math.max(0, ...this.#boxes.map(({ height }) => height));
		const headerTop = DiagramMetrics.Margin;
		this.#y = headerTop + headerHeight + SequenceMetrics.StepGap;
		for (const event of this.diagram.events) this.step(event);
		const footerTop = this.#y + SequenceMetrics.EndGap;
		for (const [id, starts] of this.#active) for (const start of starts) this.endActivation(id, start, footerTop, starts.indexOf(start));
		const participants = this.diagram.participants.map((participant, index): PlacedParticipant => {
			const { width, height } = this.#boxes[index]!;
			const x = this.#centres[index]! - width / HALF;
			const top = headerTop + headerHeight - height;
			return {
				participant,
				header: { x, y: top, width, height },
				footer: { x, y: footerTop, width, height },
				lifeline: { x: this.#centres[index]!, top: headerTop + headerHeight, bottom: footerTop },
			};
		});
		const frames = [...this.#frames].sort((left, right) => left.order - right.order).map(({ order: _, ...frame }) => frame);
		const right = Math.max(
			...participants.map(({ header }) => header.x + header.width),
			...this.#notes.map(({ rect }) => rect.x + rect.width),
			...frames.map(({ rect }) => rect.x + rect.width),
			...this.#messages.flatMap(({ points, label, self, message }) => [...points.map(({ x }) => x), self ? label.x + textSize(message.text).width : 0]),
		);
		return {
			width: Math.ceil(right + DiagramMetrics.Margin),
			height: Math.ceil(footerTop + headerHeight + DiagramMetrics.Margin),
			participants,
			activations: this.#activations,
			messages: this.#messages,
			notes: this.#notes,
			frames,
		};
	}

	/** Column centres, moved apart until everything between two columns fits. */
	private columns(): number[] {
		const centres: number[] = [];
		this.#boxes.forEach(({ width }, index) => {
			const previous = index ? centres[index - 1]! + this.#boxes[index - 1]!.width / HALF + SequenceMetrics.ColumnGap : DiagramMetrics.Margin;
			centres.push(previous + width / HALF);
		});
		const needs = this.diagram.events.flatMap((event) => this.spaceNeeded(event));
		needs.sort((left, right) => left.right - left.left - (right.right - right.left));
		for (const { left, right, space } of needs) {
			const short = space - (centres[right]! - centres[left]!);
			if (short > 0) for (let index = right; index < centres.length; index++) centres[index]! += short;
		}
		const leftmost = Math.min(0, ...this.leftOverhang(centres));
		return leftmost < 0 ? centres.map((centre) => centre - leftmost) : centres;
	}

	/** How far apart two columns must be for a step between them. */
	private spaceNeeded(event: SequenceEvent): { left: number; right: number; space: number }[] {
		if (event.kind === SequenceEventKind.Message) {
			const [left, right] = [this.column(event.from), this.column(event.to)].sort((a, b) => a - b) as [number, number];
			const label = textSize(event.text).width + DiagramMetrics.PaddingX * HALF;
			if (left !== right) return [{ left, right, space: label }];
			return left + 1 < this.#boxes.length ? [{ left, right: left + 1, space: SequenceMetrics.SelfLoopWidth + label }] : [];
		}
		if (event.kind !== SequenceEventKind.Note) return [];
		const width = noteWidth(event);
		const [first, second] = event.participants.map((id) => this.column(id));
		if (second !== undefined && second !== first) {
			const [left, right] = [first!, second].sort((a, b) => a - b) as [number, number];
			return [{ left, right, space: width - SequenceMetrics.NotePadding * HALF }];
		}
		const column = first!;
		if (event.position === NotePosition.RightOf && column + 1 < this.#boxes.length)
			return [{ left: column, right: column + 1, space: width + SequenceMetrics.NoteGap + this.#boxes[column + 1]!.width / HALF }];
		if (event.position === NotePosition.LeftOf && column > 0)
			return [{ left: column - 1, right: column, space: width + SequenceMetrics.NoteGap + this.#boxes[column - 1]!.width / HALF }];
		return [];
	}

	/** Where notes left of the first column would start, so the row can move right to make room. */
	private leftOverhang(centres: readonly number[]): number[] {
		return this.diagram.events.flatMap((event) =>
			event.kind === SequenceEventKind.Note && event.position === NotePosition.LeftOf && this.column(event.participants[0]!) === 0
				? [centres[0]! - SequenceMetrics.NoteGap - noteWidth(event) - DiagramMetrics.Margin]
				: [],
		);
	}

	private step(event: SequenceEvent): void {
		switch (event.kind) {
			case SequenceEventKind.Message:
				return this.message(event);
			case SequenceEventKind.Note:
				return this.note(event);
			case SequenceEventKind.Activate:
				return this.activate(event.participant);
			case SequenceEventKind.Deactivate:
				return this.deactivate(event.participant);
			case SequenceEventKind.FrameStart:
				this.#y += SequenceMetrics.FrameGap;
				this.#open.push({ frame: event.frame, label: event.label, top: this.#y, sections: [], extent: null, order: this.#frames.length + this.#open.length });
				this.#y += SequenceMetrics.FrameTitle;
				return;
			case SequenceEventKind.FrameSection:
				this.#y += SequenceMetrics.FrameGap;
				this.#open.at(-1)?.sections.push({ y: this.#y, label: event.label });
				this.#y += SequenceMetrics.FrameTitle;
				return;
			case SequenceEventKind.FrameEnd:
				return this.closeFrame();
		}
	}

	private message(message: SequenceMessage): void {
		const self = message.from === message.to;
		const height = textSize(message.text).height;
		this.#y += height + SequenceMetrics.LabelGap;
		const y = this.#y;
		const fromX = this.#centres[this.column(message.from)]!;
		const toX = this.#centres[this.column(message.to)]!;
		if (self) {
			const x = fromX + this.activeOffset(message.from, 1);
			const points = [
				{ x, y },
				{ x: fromX + SequenceMetrics.SelfLoopWidth, y },
				{ x: fromX + SequenceMetrics.SelfLoopWidth, y: y + SequenceMetrics.SelfLoopHeight },
				{ x, y: y + SequenceMetrics.SelfLoopHeight },
			];
			this.#messages.push({ message, points, label: { x: fromX + SequenceMetrics.SelfLoopWidth + SequenceMetrics.LabelGap, y: y + SequenceMetrics.SelfLoopHeight / HALF }, self });
			this.cover(x, fromX + SequenceMetrics.SelfLoopWidth + textSize(message.text).width);
			this.#y += SequenceMetrics.SelfLoopHeight;
		} else {
			const direction = Math.sign(toX - fromX);
			const from = { x: fromX + this.activeOffset(message.from, direction), y };
			if (message.deactivates) this.deactivate(message.from);
			if (message.activates) this.activate(message.to);
			const to = { x: toX + this.activeOffset(message.to, -direction), y };
			this.#messages.push({ message, points: [from, to], label: { x: (fromX + toX) / HALF, y: y - SequenceMetrics.LabelGap - height / HALF }, self });
			this.cover(Math.min(fromX, toX), Math.max(fromX, toX));
		}
		if (self && message.deactivates) this.deactivate(message.from);
		if (self && message.activates) this.activate(message.to);
		this.#y += SequenceMetrics.StepGap;
	}

	private note(note: SequenceNote): void {
		const width = noteWidth(note);
		const height = textSize(note.text).height + SequenceMetrics.NotePadding * HALF;
		const centres = note.participants.map((id) => this.#centres[this.column(id)]!);
		const left = Math.min(...centres);
		const right = Math.max(...centres);
		const x =
			note.position === NotePosition.RightOf
				? right + SequenceMetrics.NoteGap
				: note.position === NotePosition.LeftOf
					? left - SequenceMetrics.NoteGap - width
					: (left + right) / HALF - Math.max(width, right - left + SequenceMetrics.NotePadding * HALF) / HALF;
		const rect = { x, y: this.#y, width: note.position === NotePosition.Over ? Math.max(width, right - left + SequenceMetrics.NotePadding * HALF) : width, height };
		this.#notes.push({ note, rect });
		this.cover(rect.x, rect.x + rect.width);
		this.#y += height + SequenceMetrics.StepGap;
	}

	private activate(id: string): void {
		const starts = this.#active.get(id) ?? [];
		starts.push(this.#y);
		this.#active.set(id, starts);
	}

	private deactivate(id: string): void {
		const starts = this.#active.get(id);
		const start = starts?.pop();
		if (start !== undefined) this.endActivation(id, start, this.#y, starts!.length);
	}

	private endActivation(id: string, top: number, bottom: number, depth: number): void {
		const centre = this.#centres[this.column(id)]!;
		const x = centre - SequenceMetrics.ActivationWidth / HALF + depth * SequenceMetrics.ActivationNest;
		this.#activations.push({ x, y: top, width: SequenceMetrics.ActivationWidth, height: Math.max(bottom - top, SequenceMetrics.StepGap) });
	}

	/** Where a message meets a lifeline: at the edge of its activation bar on the side it goes to. */
	private activeOffset(id: string, direction: number): number {
		const depth = this.#active.get(id)?.length ?? 0;
		if (!depth) return 0;
		const edge = direction > 0 ? SequenceMetrics.ActivationWidth / HALF : -SequenceMetrics.ActivationWidth / HALF;
		return edge + (depth - 1) * SequenceMetrics.ActivationNest;
	}

	/** Grows the open frames to hold what was just placed. */
	private cover(left: number, right: number): void {
		const frame = this.#open.at(-1);
		if (!frame) return;
		frame.extent = frame.extent ? { left: Math.min(frame.extent.left, left), right: Math.max(frame.extent.right, right) } : { left, right };
	}

	private closeFrame(): void {
		const frame = this.#open.pop();
		if (!frame) return;
		this.#y += SequenceMetrics.FramePadding;
		const all = { left: Math.min(...this.#centres), right: Math.max(...this.#centres) };
		const extent = frame.extent ?? all;
		const left = extent.left - SequenceMetrics.FramePadding;
		const right = extent.right + SequenceMetrics.FramePadding;
		this.#frames.push({ frame: frame.frame, label: frame.label, rect: { x: left, y: frame.top, width: right - left, height: this.#y - frame.top }, sections: frame.sections, order: frame.order });
		// The frame around this one holds it with room to spare.
		this.cover(left - SequenceMetrics.FramePadding, right + SequenceMetrics.FramePadding);
		this.#y += SequenceMetrics.FrameGap;
	}

	private column(id: string): number {
		return this.#index.get(id)!;
	}
}

function participantSize(participant: SequenceParticipant): { width: number; height: number } {
	const text = textSize(participant.label);
	const width = Math.max(DiagramMetrics.MinimumWidth, text.width + DiagramMetrics.PaddingX * HALF);
	const box = Math.max(DiagramMetrics.MinimumHeight, text.height + DiagramMetrics.PaddingY * HALF);
	return participant.kind === ParticipantKind.Actor ? { width, height: SequenceMetrics.ActorFigure + text.height } : { width, height: box };
}

function noteWidth(note: SequenceNote): number {
	return Math.max(DiagramMetrics.MinimumWidth, textSize(note.text).width + SequenceMetrics.NotePadding * HALF);
}
