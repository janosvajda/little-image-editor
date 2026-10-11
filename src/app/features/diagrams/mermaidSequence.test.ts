import { describe, expect, it } from 'vitest';
import type { CropRect } from '../../core/document/appTypes';
import { LineEnd } from '../annotations/lineEnd';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { textSize } from './diagramLayout';
import {
	FrameKind,
	NotePosition,
	ParticipantKind,
	parseSequenceDiagram,
	type SequenceEvent,
	SequenceEventKind,
	type SequenceMessage,
} from './mermaidSequence';
import { DiagramSyntaxError } from './mermaidText';
import { drawSequenceDiagram, SequenceLayer } from './sequenceDrawing';
import { layoutSequence, SequenceMetrics } from './sequenceLayout';

const CHECKOUT = `sequenceDiagram
  autonumber
  actor User
  participant Web as Web app
  participant API
  User->>Web: Pay
  Web->>+API: POST /orders
  API->>API: validate
  alt card accepted
    API-->>-Web: 201 Created
  else declined
    API--xWeb: 402
  end
  Note over Web,API: HTTPS
  Note right of API: logs it
  loop every second
    Web-)API: poll
  end`;

const messages = (events: readonly SequenceEvent[]) => events.filter((event): event is SequenceMessage => event.kind === SequenceEventKind.Message);

describe('reading a Mermaid sequence diagram', () => {
	it('reads participants and actors in order, with their aliases, adding the ones only messages name', () => {
		const diagram = parseSequenceDiagram('sequenceDiagram\n  participant B as Billing<br>service\n  actor A\n  A->>C: hi');
		expect(diagram.participants).toEqual([
			{ id: 'B', label: ['Billing', 'service'], kind: ParticipantKind.Participant },
			{ id: 'A', label: ['A'], kind: ParticipantKind.Actor },
			{ id: 'C', label: ['C'], kind: ParticipantKind.Participant },
		]);
	});

	it('reads every arrow as its line and ends, numbering messages after autonumber', () => {
		const source = ['->', '-->', '->>', '-->>', '-x', '--x', '-)', '--)', '<<->>', '<<-->>'].map((arrow) => `  A${arrow}B: m`).join('\n');
		const read = messages(parseSequenceDiagram(`sequenceDiagram\n${source}`).events).map(({ dashed, head, tail }) => [dashed, head, tail]);
		expect(read).toEqual([
			[false, LineEnd.None, LineEnd.None],
			[true, LineEnd.None, LineEnd.None],
			[false, LineEnd.Arrow, LineEnd.None],
			[true, LineEnd.Arrow, LineEnd.None],
			[false, LineEnd.Cross, LineEnd.None],
			[true, LineEnd.Cross, LineEnd.None],
			[false, LineEnd.OpenArrow, LineEnd.None],
			[true, LineEnd.OpenArrow, LineEnd.None],
			[false, LineEnd.Arrow, LineEnd.Arrow],
			[true, LineEnd.Arrow, LineEnd.Arrow],
		]);
		const numbered = messages(parseSequenceDiagram(CHECKOUT).events).map(({ text }) => text[0]);
		expect(numbered).toEqual(['1. Pay', '2. POST /orders', '3. validate', '4. 201 Created', '5. 402', '6. poll']);
	});

	it('reads activations, notes and frames with their sections', () => {
		const { events } = parseSequenceDiagram(CHECKOUT);
		const [, post, , created] = messages(events);
		expect(post).toMatchObject({ from: 'Web', to: 'API', activates: true, deactivates: false });
		expect(created).toMatchObject({ from: 'API', to: 'Web', dashed: true, activates: false, deactivates: true });
		expect(events.filter(({ kind }) => kind === SequenceEventKind.Note)).toEqual([
			{ kind: SequenceEventKind.Note, position: NotePosition.Over, participants: ['Web', 'API'], text: ['HTTPS'] },
			{ kind: SequenceEventKind.Note, position: NotePosition.RightOf, participants: ['API'], text: ['logs it'] },
		]);
		expect(events.filter(({ kind }) => kind !== SequenceEventKind.Message && kind !== SequenceEventKind.Note)).toEqual([
			{ kind: SequenceEventKind.FrameStart, frame: FrameKind.Alt, label: 'card accepted' },
			{ kind: SequenceEventKind.FrameSection, label: 'declined' },
			{ kind: SequenceEventKind.FrameEnd },
			{ kind: SequenceEventKind.FrameStart, frame: FrameKind.Loop, label: 'every second' },
			{ kind: SequenceEventKind.FrameEnd },
		]);
	});

	it('accepts boxes, titles and explicit activations, and names its mistakes with their lines', () => {
		const { events } = parseSequenceDiagram('sequenceDiagram\n  title Checkout\n  box Aqua Shop\n  participant A\n  end\n  activate A\n  deactivate A');
		expect(events.map(({ kind }) => kind)).toEqual([SequenceEventKind.Activate, SequenceEventKind.Deactivate]);
		const mistakes: [string, string][] = [
			['classDiagram\n  A <|-- B', 'Line 1: A sequence diagram starts with "sequenceDiagram".'],
			['sequenceDiagram\n  loop forever\n  A->>B: hi', 'Line 3: a frame has no end.'],
			['sequenceDiagram\n  end', 'Line 2: end without a frame or box.'],
			['sequenceDiagram\n  else nope', 'Line 2: else outside alt, par or critical.'],
			['sequenceDiagram\n  A=>B: hi', 'Line 2: Unknown statement "A=>B: hi".'],
		];
		for (const [source, message] of mistakes) expect(() => parseSequenceDiagram(source)).toThrow(new DiagramSyntaxError(message));
	});
});

describe('laying out a sequence diagram', () => {
	const layout = layoutSequence(parseSequenceDiagram(CHECKOUT));
	const inside = (rect: CropRect) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= layout.width && rect.y + rect.height <= layout.height;

	it('puts participants in a row, at the top and again at the bottom, joined by their lifelines', () => {
		const xs = layout.participants.map(({ lifeline }) => lifeline.x);
		expect(xs).toEqual([...xs].sort((left, right) => left - right));
		for (const { header, footer, lifeline } of layout.participants) {
			expect(lifeline.top).toBe(header.y + header.height);
			expect(lifeline.bottom).toBe(footer.y);
			expect(inside(header) && inside(footer)).toBe(true);
		}
	});

	it('places each step below the one before, with room for every label between its columns', () => {
		const ys = layout.messages.map(({ points }) => points[0]!.y);
		expect(ys).toEqual([...ys].sort((left, right) => left - right));
		for (const { message, points, self } of layout.messages) {
			if (self) continue;
			expect(Math.abs(points[1]!.x - points[0]!.x)).toBeGreaterThanOrEqual(textSize(message.text).width - SequenceMetrics.ActivationWidth);
		}
	});

	it('loops a message to its own sender, and starts and ends activation bars', () => {
		const self = layout.messages.find(({ self: loops }) => loops)!;
		expect(self.points).toHaveLength(4);
		expect(self.points[0]!.y).toBeLessThan(self.points.at(-1)!.y);
		expect(layout.activations).toHaveLength(1);
		const [bar] = layout.activations;
		const api = layout.participants.find(({ participant }) => participant.id === 'API')!;
		expect(bar!.x).toBeLessThan(api.lifeline.x);
		expect(bar!.x + bar!.width).toBeGreaterThan(api.lifeline.x);
	});

	it('frames the steps inside a frame, divides it at each section, and keeps notes and frames in the picture', () => {
		const alt = layout.frames.find(({ frame }) => frame === FrameKind.Alt)!;
		expect(alt.sections).toEqual([{ y: expect.any(Number), label: 'declined' }]);
		expect(alt.sections[0]!.y).toBeGreaterThan(alt.rect.y);
		expect(alt.sections[0]!.y).toBeLessThan(alt.rect.y + alt.rect.height);
		for (const { rect } of [...layout.frames, ...layout.notes]) expect(inside(rect)).toBe(true);
	});
});

describe('drawing a sequence diagram', () => {
	it('draws named layers from frames up to participants, actors as stick figures, messages with their ends', () => {
		const drawing = drawSequenceDiagram(parseSequenceDiagram(CHECKOUT), { x: 10, y: 20 });
		const layers = drawing.commands.filter((command) => command.kind === AssistantCommandKind.AddLayer).map((command) => ('name' in command ? command.name : ''));
		expect(layers).toEqual([SequenceLayer.Frames, SequenceLayer.Lifelines, SequenceLayer.Messages, SequenceLayer.Notes, SequenceLayer.Participants]);
		const lines = drawing.commands.filter((command) => command.kind === AssistantCommandKind.AddLine);
		expect(lines.some((line) => 'head' in line && line.head === LineEnd.Cross)).toBe(true);
		expect(lines.some((line) => 'head' in line && line.head === LineEnd.OpenArrow)).toBe(true);
		const texts = drawing.commands.flatMap((command) => (command.kind === AssistantCommandKind.AddText ? [command.text] : []));
		expect(texts).toEqual(expect.arrayContaining(['alt', '[card accepted]', '[declined]', 'loop', 'User', 'Web app', '6. poll']));
		for (const command of drawing.commands) if (command.kind === AssistantCommandKind.AddShape) expect(command.rect.x).toBeGreaterThanOrEqual(10);
		expect(drawing.width).toBeGreaterThan(0);
		expect(drawing.height).toBeGreaterThan(0);
	});

	it('draws a diagram without frames or notes without those layers', () => {
		const drawing = drawSequenceDiagram(parseSequenceDiagram('sequenceDiagram\n  A->>B: hi'), { x: 0, y: 0 });
		const layers = drawing.commands.filter((command) => command.kind === AssistantCommandKind.AddLayer).map((command) => ('name' in command ? command.name : ''));
		expect(layers).toEqual([SequenceLayer.Lifelines, SequenceLayer.Messages, SequenceLayer.Participants]);
	});
});
