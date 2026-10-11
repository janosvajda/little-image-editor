import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { parseDrawScript } from '../assistant/drawScript';
import { drawMermaidFlowchart } from '../diagrams/diagramDrawing';
import { AnnotationDocument } from './annotationDocument';
import { renderAnnotationObject } from './annotationRenderer';
import { isAnnotationSessionState } from './annotationSerialization';
import { AnnotationObjectTypeId, type ConnectorAnnotation, LineDash } from './annotationTypes';

/** A link that leaves to the right, turns down, then right again. */
function bentConnector(overrides: Partial<ConnectorAnnotation> = {}): ConnectorAnnotation {
	return {
		id: 'link',
		type: AnnotationObjectTypeId.Connector,
		points: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 90 }, { x: 110, y: 90 }],
		color: '#333333',
		width: 2,
		opacity: 1,
		arrow: true,
		dash: LineDash.Solid,
		...overrides,
	};
}

function documentModel(): CanvasDocument {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'links', width: 200, height: 120, transparent: false, background: '#ffffff' });
	return model;
}

describe('a connector: one line with bends', () => {
	it('is framed by its points and stretches with its frame, keeping its bends', () => {
		const connector = bentConnector();
		const shape = genericShape(connector);
		expect(shape.geometry.rect).toEqual({ x: 10, y: 10, width: 100, height: 80 });
		shape.move({ x: 5, y: -5 });
		expect(connector.points[0]).toEqual({ x: 15, y: 5 });
		shape.setGeometry({ rect: { x: 15, y: 5, width: 200, height: 40 }, rotation: 0 });
		expect(connector.points).toEqual([{ x: 15, y: 5 }, { x: 115, y: 5 }, { x: 115, y: 45 }, { x: 215, y: 45 }]);
		// A straight vertical connector stays centred when its frame gets wider.
		const vertical = bentConnector({ points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] });
		genericShape(vertical).setGeometry({ rect: { x: 40, y: 0, width: 20, height: 100 }, rotation: 0 });
		expect(vertical.points.map(({ x }) => x)).toEqual([50, 50]);
	});

	it('is picked up along its pieces, not in the empty corner of its frame', () => {
		const objects = new AnnotationDocument();
		objects.add(bentConnector());
		expect(objects.hitTest({ x: 60, y: 50 })?.id).toBe('link');
		expect(objects.hitTest({ x: 100, y: 20 })).toBeNull();
	});

	it('draws one path, in dashes when dashed, with an arrowhead on its last piece', () => {
		const context = document.querySelector<HTMLCanvasElement>('#overlay')!.getContext('2d')!;
		Object.assign(context, { setLineDash: vi.fn(), lineTo: vi.fn(), moveTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), beginPath: vi.fn(), closePath: vi.fn() });
		renderAnnotationObject(context, document.createElement('canvas'), bentConnector({ dash: LineDash.Dashed }));
		expect(context.setLineDash).toHaveBeenCalledWith([6, 4]);
		expect(context.stroke).toHaveBeenCalledOnce();
		expect(context.fill).toHaveBeenCalledOnce();
	});

	it('saves into projects and refuses a broken one', () => {
		const objects = new AnnotationDocument();
		objects.add(bentConnector());
		const saved = JSON.parse(JSON.stringify(objects.snapshotSession()));
		expect(isAnnotationSessionState(saved)).toBe(true);
		const restored = new AnnotationDocument();
		restored.restoreSession(saved);
		expect(restored.object('link')).toEqual(bentConnector());
		const broken = structuredClone(saved);
		broken.state.objects[0].points = [{ x: 1, y: 1 }];
		expect(isAnnotationSessionState(broken)).toBe(false);
	});
});

describe('making connectors', () => {
	it('turns a line with bends or dashes into one connector, and keeps a plain line a line shape', () => {
		const model = documentModel();
		const objects = new AnnotationDocument();
		const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
		const line = { kind: AssistantCommandKind.AddLine, from: { x: 0, y: 0 }, to: { x: 50, y: 50 }, arrow: true, color: '#000000', width: 3, opacity: 1 } as const;
		runner.run({ ...line, via: [{ x: 50, y: 0 }] });
		runner.run({ ...line, dashed: true });
		runner.run(line);
		expect(objects.state.objects.map((item) => item.type)).toEqual([
			AnnotationObjectTypeId.Connector,
			AnnotationObjectTypeId.Connector,
			AnnotationObjectTypeId.Shape,
		]);
		expect(objects.state.objects[0]).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], arrow: true, dash: LineDash.Solid });
		expect(objects.state.objects[1]).toMatchObject({ dash: LineDash.Dashed });
	});

	it('reads extra script points as bends and dashed as a line style', () => {
		const [command] = parseDrawScript('arrow 10,10 100,10 100,80 #000000 width 3 dashed').commands;
		expect(command).toEqual({
			kind: AssistantCommandKind.AddLine,
			from: { x: 10, y: 10 },
			via: [{ x: 100, y: 10 }],
			to: { x: 100, y: 80 },
			arrow: true,
			color: '#000000',
			width: 3,
			opacity: 1,
			dashed: true,
		});
	});

	it('draws every diagram link as one item, dotted links in dashes', () => {
		const { commands } = drawMermaidFlowchart('flowchart TD\n  a --> b & c\n  a -.-> d');
		const lines = commands.filter((command) => command.kind === AssistantCommandKind.AddLine);
		expect(lines).toHaveLength(3);
		expect(lines.some((line) => 'via' in line && line.via?.length)).toBe(true);
		expect(lines.filter((line) => 'dashed' in line && line.dashed)).toHaveLength(1);
	});
});
