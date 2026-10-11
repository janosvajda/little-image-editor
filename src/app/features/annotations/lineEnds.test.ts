import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { parseDrawScript } from '../assistant/drawScript';
import { ConnectorDrawingGesture } from '../drawing/gestures/connectorDrawingGesture';
import { AnnotationDocument } from './annotationDocument';
import { renderAnnotationObject } from './annotationRenderer';
import { isAnnotationSessionState } from './annotationSerialization';
import { AnnotationObjectTypeId, type ConnectorAnnotation, connectorEnds, LineDash } from './annotationTypes';
import { arrowHeadLength, drawLineEnd, lineEndInset, lineEndLength } from './arrowHead';
import { ARROW_ENDS, isLineEnd, LINE_END_LABELS, LineEnd } from './lineEnd';

const STYLE = { color: '#222222', size: 2, opacity: 1 };

function connector(overrides: Partial<ConnectorAnnotation> = {}): ConnectorAnnotation {
	return {
		id: 'relation',
		type: AnnotationObjectTypeId.Connector,
		points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
		color: '#222222',
		width: 2,
		opacity: 1,
		arrow: false,
		dash: LineDash.Solid,
		...overrides,
	};
}

function recordingContext() {
	const context = document.querySelector<HTMLCanvasElement>('#overlay')!.getContext('2d')!;
	const calls = { lineTo: vi.fn(), moveTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), setLineDash: vi.fn() };
	Object.assign(context, calls);
	return { context, calls };
}

function documentModel(): CanvasDocument {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'ends', width: 200, height: 200, transparent: false, background: '#ffffff' });
	return model;
}

describe('line ends', () => {
	it('are named, each with a label people choose it by', () => {
		for (const end of Object.values(LineEnd)) {
			expect(isLineEnd(end)).toBe(true);
			expect(LINE_END_LABELS[end]).toBeTruthy();
		}
		expect(isLineEnd('spiral')).toBe(false);
		expect(ARROW_ENDS).toEqual({ head: LineEnd.Arrow, tail: LineEnd.None });
	});

	it('reach back from the tip by their size, and only hollow ends stop the line short', () => {
		const width = 2;
		expect(lineEndLength(width, LineEnd.None)).toBe(0);
		expect(lineEndLength(width, LineEnd.Arrow)).toBe(arrowHeadLength(width));
		expect(lineEndLength(width, LineEnd.Diamond)).toBeGreaterThan(arrowHeadLength(width));
		for (const hollow of [LineEnd.Triangle, LineEnd.Diamond, LineEnd.Circle]) expect(lineEndInset(width, hollow)).toBe(lineEndLength(width, hollow));
		for (const solid of [LineEnd.None, LineEnd.Arrow, LineEnd.FilledDiamond, LineEnd.OpenArrow, LineEnd.Cross]) expect(lineEndInset(width, solid)).toBe(0);
	});

	it('draw filled, outlined or as lines, each in its own way', () => {
		const from = { x: 0, y: 0 };
		const to = { x: 50, y: 0 };
		const drawn = (end: LineEnd) => {
			const { context, calls } = recordingContext();
			drawLineEnd(context, from, to, 2, end);
			return { fill: calls.fill.mock.calls.length, stroke: calls.stroke.mock.calls.length, arc: calls.arc.mock.calls.length, moves: calls.moveTo.mock.calls.length };
		};
		expect(drawn(LineEnd.None)).toEqual({ fill: 0, stroke: 0, arc: 0, moves: 0 });
		expect(drawn(LineEnd.Arrow)).toMatchObject({ fill: 1, stroke: 0 });
		expect(drawn(LineEnd.OpenArrow)).toMatchObject({ fill: 0, stroke: 1 });
		expect(drawn(LineEnd.Triangle)).toMatchObject({ fill: 0, stroke: 1 });
		expect(drawn(LineEnd.Diamond)).toMatchObject({ fill: 0, stroke: 1 });
		expect(drawn(LineEnd.FilledDiamond)).toMatchObject({ fill: 1, stroke: 1 });
		expect(drawn(LineEnd.Circle)).toMatchObject({ fill: 0, stroke: 1, arc: 1 });
		expect(drawn(LineEnd.Cross)).toMatchObject({ fill: 0, stroke: 1, moves: 2 });
	});
});

describe('connector ends', () => {
	it('come from arrow in connectors saved before ends had names', () => {
		expect(connectorEnds(connector({ arrow: true }))).toEqual(ARROW_ENDS);
		expect(connectorEnds(connector())).toEqual({ head: LineEnd.None, tail: LineEnd.None });
		expect(connectorEnds(connector({ arrow: true, head: LineEnd.Triangle, tail: LineEnd.FilledDiamond }))).toEqual({ head: LineEnd.Triangle, tail: LineEnd.FilledDiamond });
	});

	it('stop the line at the back of a hollow end and draw both ends', () => {
		const { context, calls } = recordingContext();
		renderAnnotationObject(context, document.createElement('canvas'), connector({ head: LineEnd.Triangle, tail: LineEnd.FilledDiamond }));
		const [lineStart] = calls.moveTo.mock.calls[0]!;
		const [lineEnd] = calls.lineTo.mock.calls[0]!;
		expect(lineStart).toBe(0);
		expect(lineEnd).toBe(100 - lineEndInset(2, LineEnd.Triangle));
		// The line, the triangle and the diamond's outline; the diamond's fill.
		expect(calls.stroke).toHaveBeenCalledTimes(3);
		expect(calls.fill).toHaveBeenCalledOnce();
	});

	it('save into projects, and a project with an unknown end is refused', () => {
		const objects = new AnnotationDocument();
		objects.add(connector({ head: LineEnd.Triangle, tail: LineEnd.Diamond }));
		const saved = JSON.parse(JSON.stringify(objects.snapshotSession()));
		expect(isAnnotationSessionState(saved)).toBe(true);
		const restored = new AnnotationDocument();
		restored.restoreSession(saved);
		expect(restored.object('relation')).toMatchObject({ head: LineEnd.Triangle, tail: LineEnd.Diamond });
		const broken = structuredClone(saved);
		broken.state.objects[0].tail = 'spiral';
		expect(isAnnotationSessionState(broken)).toBe(false);
	});
});

describe('drawing lines with named ends', () => {
	it('makes one connector from a line with ends, with no arrowhead when its head is none', () => {
		const objects = new AnnotationDocument();
		const runner = new AssistantCommandRunner(documentModel(), objects, { undo: vi.fn(), canUndo: false });
		const line = { kind: AssistantCommandKind.AddLine, from: { x: 0, y: 0 }, to: { x: 80, y: 0 }, arrow: true, color: '#000000', width: 2, opacity: 1 } as const;
		runner.run({ ...line, head: LineEnd.Triangle });
		runner.run({ ...line, head: LineEnd.None, tail: LineEnd.Diamond });
		expect(objects.state.objects).toEqual([
			expect.objectContaining({ type: AnnotationObjectTypeId.Connector, arrow: true, head: LineEnd.Triangle }),
			expect.objectContaining({ type: AnnotationObjectTypeId.Connector, arrow: false, head: LineEnd.None, tail: LineEnd.Diamond }),
		]);
	});

	it('reads head and tail in a draw script, and names the ends when one is unknown', () => {
		const [command] = parseDrawScript('line 0,0 80,0 #000000 tail filledDiamond head TRIANGLE').commands;
		expect(command).toMatchObject({ kind: AssistantCommandKind.AddLine, head: LineEnd.Triangle, tail: LineEnd.FilledDiamond });
		expect(() => parseDrawScript('arrow 0,0 80,0 #000000 head spiral')).toThrow(`Line 1: head is one of ${Object.values(LineEnd).join(', ')}.`);
		expect(() => parseDrawScript('arrow 0,0 80,0 #000000 head')).toThrow('Line 1: arrow needs an end after head.');
	});

	it('gives an elbow arrow the ends chosen for it', () => {
		const objects = new AnnotationDocument();
		const gesture = new ConnectorDrawingGesture(documentModel(), objects, { x: 10, y: 10 }, () => STYLE, () => ({ head: LineEnd.Triangle, tail: LineEnd.Circle }));
		gesture.complete({ x: 120, y: 90 });
		const plain = new ConnectorDrawingGesture(documentModel(), objects, { x: 10, y: 10 }, () => STYLE, () => ({ head: LineEnd.None, tail: LineEnd.None }));
		plain.complete({ x: 120, y: 90 });
		const [chosen, bare] = objects.state.objects;
		expect(chosen).toMatchObject({ arrow: true, head: LineEnd.Triangle, tail: LineEnd.Circle });
		expect(bare).toMatchObject({ arrow: false });
		expect(bare).not.toHaveProperty('head');
		expect(bare).not.toHaveProperty('tail');
	});
});
