import type { CropRect, Point } from '../../core/document/appTypes';
import { ShapeToolId } from '../../core/document/appTypes';
import { AssistantCommandKind, type DrawingCommand } from '../assistant/assistantCommandTypes';
import type { DiagramDrawing } from './diagramDrawing';
import { DiagramMetrics, textSize } from './diagramLayout';
import {
	centredLabel,
	DiagramStroke,
	DiagramTheme,
	diagramLine,
	diagramText,
	filledShape,
	framedShape,
	LABEL_PADDING,
	leftAlignedLines,
	Placement,
} from './diagramShapes';
import { FrameKind, ParticipantKind, type SequenceDiagram } from './mermaidSequence';
import { layoutSequence, type PlacedFrame, type PlacedMessage, type PlacedParticipant, SequenceMetrics } from './sequenceLayout';

/**
 * Draws a laid-out sequence diagram from the same editable pieces as every
 * diagram, on named layers from the bottom: frames, lifelines with their
 * activations, messages, notes, and the participants on top.
 */

export const SequenceLayer = {
	Frames: 'Frames',
	Lifelines: 'Lifelines',
	Messages: 'Messages',
	Notes: 'Notes',
	Participants: 'Participants',
} as const;

const HALF = 2;
/** The parts of an actor's stick figure, from the top of its figure. */
const Actor = { Head: 14, Neck: 14, Body: 30, ArmSpan: 26, ArmHeight: 20, LegSpan: 20, Feet: 42 } as const;
const FRAME_TAB_PADDING = 8;

export function drawSequenceDiagram(diagram: SequenceDiagram, origin: Point): DiagramDrawing {
	const layout = layoutSequence(diagram);
	const place = new Placement(origin);
	const layer = (name: string): DrawingCommand => ({ kind: AssistantCommandKind.AddLayer, name });
	const commands: DrawingCommand[] = [
		...(layout.frames.length ? [layer(SequenceLayer.Frames), ...layout.frames.flatMap((frame) => frameCommands(frame, place))] : []),
		layer(SequenceLayer.Lifelines),
		...layout.participants.flatMap(({ lifeline }) =>
			diagramLine([place.at({ x: lifeline.x, y: lifeline.top }), place.at({ x: lifeline.x, y: lifeline.bottom })], { dashed: true, color: DiagramTheme.GroupBorder }),
		),
		...layout.activations.flatMap((rect) => framedShape(ShapeToolId.Rectangle, place.box(rect), DiagramTheme.NodeFill, DiagramTheme.NodeBorder, DiagramStroke.GroupBorder)),
		layer(SequenceLayer.Messages),
		...layout.messages.flatMap((message) => messageCommands(message, place)),
		...(layout.notes.length
			? [
					layer(SequenceLayer.Notes),
					...layout.notes.flatMap(({ note, rect }) => [
						...framedShape(ShapeToolId.Rectangle, place.box(rect), DiagramTheme.NoteFill, DiagramTheme.NoteBorder, DiagramStroke.GroupBorder),
						...centredLabel(note.text, place.at(middleOf(rect))),
					]),
				]
			: []),
		layer(SequenceLayer.Participants),
		...layout.participants.flatMap((participant) => participantCommands(participant, place)),
	];
	return { commands, width: layout.width, height: layout.height };
}

function messageCommands({ message, points, label, self }: PlacedMessage, place: Placement): DrawingCommand[] {
	return [
		...diagramLine(
			points.map((point) => place.at(point)),
			{ dashed: message.dashed, head: message.head, tail: message.tail, arrow: false },
		),
		...(self
			? leftAlignedLines(message.text, place.at({ x: label.x, y: label.y - textSize(message.text).height / HALF }))
			: centredLabel(message.text, place.at(label))),
	];
}

/** A participant's box at the top and the bottom, or an actor's stick figure with its name under it. */
function participantCommands({ participant, header, footer }: PlacedParticipant, place: Placement): DrawingCommand[] {
	return [header, footer].flatMap((rect) =>
		participant.kind === ParticipantKind.Actor
			? [...actorFigure(rect, place), ...centredLabel(participant.label, place.at({ x: rect.x + rect.width / HALF, y: rect.y + SequenceMetrics.ActorFigure + textSize(participant.label).height / HALF }))]
			: [...framedShape(ShapeToolId.Rectangle, place.box(rect), DiagramTheme.NodeFill, DiagramTheme.NodeBorder, DiagramStroke.Border), ...centredLabel(participant.label, place.at(middleOf(rect)))],
	);
}

function actorFigure(rect: CropRect, place: Placement): DrawingCommand[] {
	const centre = rect.x + rect.width / HALF;
	const top = rect.y;
	const line = (from: Point, to: Point) => diagramLine([place.at(from), place.at(to)], { color: DiagramTheme.Marker });
	return [
		{ ...filledShape(ShapeToolId.Ellipse, place.box({ x: centre - Actor.Head / HALF, y: top, width: Actor.Head, height: Actor.Head }), DiagramTheme.Marker), fill: false },
		...line({ x: centre, y: top + Actor.Neck }, { x: centre, y: top + Actor.Body }),
		...line({ x: centre - Actor.ArmSpan / HALF, y: top + Actor.ArmHeight }, { x: centre + Actor.ArmSpan / HALF, y: top + Actor.ArmHeight }),
		...line({ x: centre, y: top + Actor.Body }, { x: centre - Actor.LegSpan / HALF, y: top + Actor.Feet }),
		...line({ x: centre, y: top + Actor.Body }, { x: centre + Actor.LegSpan / HALF, y: top + Actor.Feet }),
	];
}

/** A frame: its outline with a tab naming its kind, its condition, and a dashed rule at each section. */
function frameCommands({ frame, label, rect, sections }: PlacedFrame, place: Placement): DrawingCommand[] {
	const box = place.box(rect);
	if (frame === FrameKind.Rect) return [filledShape(ShapeToolId.Rectangle, box, DiagramTheme.GroupFill)];
	const tab = textSize([frame]);
	const tabRect = { x: box.x, y: box.y, width: Math.round(tab.width + FRAME_TAB_PADDING * HALF), height: Math.round(tab.height + LABEL_PADDING * HALF) };
	const condition = (text: string, y: number) => (text ? [diagramText(`[${text}]`, { x: tabRect.x + tabRect.width + FRAME_TAB_PADDING, y }, DiagramTheme.GroupTitle)] : []);
	return [
		{ ...filledShape(ShapeToolId.Rectangle, box, DiagramTheme.GroupBorder), fill: false, strokeWidth: DiagramStroke.GroupBorder },
		...framedShape(ShapeToolId.Rectangle, tabRect, DiagramTheme.GroupFill, DiagramTheme.GroupBorder, DiagramStroke.GroupBorder),
		diagramText(frame, { x: tabRect.x + FRAME_TAB_PADDING, y: tabRect.y + LABEL_PADDING + DiagramMetrics.FontSize }, DiagramTheme.GroupTitle),
		...condition(label, tabRect.y + LABEL_PADDING + DiagramMetrics.FontSize),
		...sections.flatMap(({ y, label: sectionLabel }) => {
			const at = place.at({ x: rect.x, y });
			return [
				...diagramLine([at, { x: at.x + box.width, y: at.y }], { dashed: true, color: DiagramTheme.GroupBorder, width: DiagramStroke.GroupBorder }),
				...condition(sectionLabel, at.y + LABEL_PADDING + DiagramMetrics.FontSize),
			];
		}),
	];
}

function middleOf(rect: CropRect): Point {
	return { x: rect.x + rect.width / HALF, y: rect.y + rect.height / HALF };
}
