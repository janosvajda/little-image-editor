import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { parsePathData } from '../../core/geometry/vectorPath';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import { AnnotationObjectTypeId, LineDash, type PathAnnotation } from '../annotations/annotationTypes';
import { EditableObjectPropertyId, editableObjectProperties } from '../annotations/editableObjectProperties';
import { LineEnd, PLAIN_ENDS } from '../annotations/lineEnd';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { parseDrawScript } from '../assistant/drawScript';
import { layerItemLabel } from '../layers/layerItemLabels';
import { PathPointEditor } from './pathPointEditor';
import { PEN_NODE_REACH, PenTool } from './penTool';

const STYLE = { stroke: { color: '#223344', size: 3, opacity: 1, hardness: 1 }, fill: false, ends: PLAIN_ENDS };

function path(overrides: Partial<PathAnnotation> = {}): PathAnnotation {
	return {
		id: 'path',
		type: AnnotationObjectTypeId.Path,
		contours: parsePathData('M0 0 L100 0 L100 100 L0 100 Z'),
		color: '#223344',
		width: 4,
		opacity: 1,
		fill: false,
		dash: LineDash.Solid,
		...overrides,
	};
}

let model: CanvasDocument;
beforeEach(() => {
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'paths', width: 300, height: 300, transparent: false, background: '#ffffff' });
});

describe('a path item', () => {
	it('fills its closed contours with its fill colour by its rule, then draws its line, dashed when asked', () => {
		const context = document.querySelector<HTMLCanvasElement>('#overlay')!.getContext('2d')!;
		const fill = vi.fn();
		const stroke = vi.fn();
		const setLineDash = vi.fn();
		Object.assign(context, { fill, stroke, setLineDash });
		renderAnnotationObject(context, document.createElement('canvas'), path({ fill: true, fillColor: '#ffcc00', fillRule: 'evenodd', dash: LineDash.Dashed }));
		expect(fill).toHaveBeenCalledWith('evenodd');
		expect(stroke).toHaveBeenCalledOnce();
		expect(setLineDash).toHaveBeenCalledWith([12, 8]);
		fill.mockClear();
		stroke.mockClear();
		// Filled without a fill colour, a path is only its fill, as a filled shape is.
		renderAnnotationObject(context, document.createElement('canvas'), path({ fill: true }));
		expect(fill).toHaveBeenCalledOnce();
		expect(stroke).not.toHaveBeenCalled();
	});

	it('is picked along its line, and inside only when filled', () => {
		const objects = new AnnotationDocument();
		objects.add(path());
		expect(objects.hitTest({ x: 50, y: 1 })?.id).toBe('path');
		expect(objects.hitTest({ x: 50, y: 50 })).toBeNull();
		objects.update('path', (item) => {
			if (item.type === AnnotationObjectTypeId.Path) item.fill = true;
		});
		expect(objects.hitTest({ x: 50, y: 50 })?.id).toBe('path');
	});

	it('is framed by its curves and stretches every node and handle with its frame', () => {
		const curved = path({ contours: parsePathData('M0 0 C0 -40 100 -40 100 0') });
		const shape = genericShape(curved);
		expect(shape.geometry.rect).toEqual({ x: 0, y: -30, width: 100, height: 30 });
		shape.setGeometry({ rect: { x: 0, y: 0, width: 200, height: 60 }, rotation: 0 });
		expect(curved.contours[0]!.nodes[0]).toEqual({ point: { x: 0, y: 60 }, out: { x: 0, y: -20 } });
	});

	it('is called a Path, and offers its line, fill and fill colour', () => {
		expect(layerItemLabel(path())).toBe('Path');
		expect(editableObjectProperties(path({ fill: true, fillColor: '#ffcc00' }))).toMatchObject({
			[EditableObjectPropertyId.Color]: '#223344',
			[EditableObjectPropertyId.Fill]: true,
			[EditableObjectPropertyId.FillColor]: '#ffcc00',
		});
	});

	it('is drawn from SVG path data by commands and scripts, which name what is wrong', () => {
		const objects = new AnnotationDocument();
		const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
		const [command] = parseDrawScript('path "M10 10 C 40 0 60 0 90 10 Z" #333333 width 2 fill #ffcc00 dashed').commands;
		expect(command).toMatchObject({ kind: AssistantCommandKind.AddPath, d: 'M10 10 C 40 0 60 0 90 10 Z', fill: true, fillColor: '#ffcc00', dashed: true, width: 2 });
		runner.run(command!);
		expect(objects.state.objects[0]).toMatchObject({ type: AnnotationObjectTypeId.Path, fill: true, fillColor: '#ffcc00', dash: LineDash.Dashed });
		expect(() => parseDrawScript('path "M0 0 C1 1" #000000')).toThrow('Line 1: C needs 6 numbers.');
		expect(() => parseDrawScript('path M0 0 L1 1 #000000')).toThrow('Line 1: path needs its data in quotes');
		expect(() => runner.run({ kind: AssistantCommandKind.AddPath, d: 'nonsense', color: '#000000', width: 2, opacity: 1 })).toThrow();
	});
});

describe('the Pen', () => {
	const pen = (objects: AnnotationDocument, style = STYLE) => new PenTool(model, objects, () => style);
	const click = (tool: PenTool, x: number, y: number) => tool.begin({ x, y }, 1).complete({ x, y });

	it('adds a node for each click and, on Enter, one path with a corner at each', () => {
		const objects = new AnnotationDocument();
		const tool = pen(objects);
		click(tool, 10, 10);
		click(tool, 100, 10);
		click(tool, 100, 100);
		expect(objects.state.objects).toHaveLength(0);
		tool.finish();
		expect(objects.state.objects).toEqual([
			expect.objectContaining({ type: AnnotationObjectTypeId.Path, color: '#223344', width: 3, contours: parsePathData('M10 10 L100 10 L100 100') }),
		]);
		expect(tool.drawing).toBe(false);
	});

	it('pulls out mirrored curve handles when a press is dragged', () => {
		const objects = new AnnotationDocument();
		const tool = pen(objects);
		click(tool, 10, 10);
		const gesture = tool.begin({ x: 100, y: 50 }, 1);
		gesture.update({ x: 140, y: 50 }, 1);
		gesture.complete({ x: 140, y: 50 });
		click(tool, 200, 10);
		tool.finish();
		const item = objects.state.objects[0] as PathAnnotation;
		expect(item.contours[0]!.nodes[1]).toEqual({ point: { x: 100, y: 50 }, out: { x: 140, y: 50 }, in: { x: 60, y: 50 } });
	});

	it('closes the path on its first node, filled when fill is on, with the chosen ends on open paths only', () => {
		const objects = new AnnotationDocument();
		const tool = pen(objects, { ...STYLE, fill: true, ends: { head: LineEnd.Arrow, tail: LineEnd.None } });
		click(tool, 10, 10);
		click(tool, 100, 10);
		click(tool, 100, 100);
		click(tool, 10 + PEN_NODE_REACH / 2, 10);
		const item = objects.state.objects[0] as PathAnnotation;
		expect(item.contours[0]!.closed).toBe(true);
		expect(item.contours[0]!.nodes).toHaveLength(3);
		expect(item).toMatchObject({ fill: true, head: LineEnd.Arrow });
	});

	it('does not add a node for the second press of a double-click, and drops a path of one node or a cancelled one', () => {
		const objects = new AnnotationDocument();
		const tool = pen(objects);
		click(tool, 10, 10);
		click(tool, 10, 11);
		tool.finish();
		expect(objects.state.objects).toHaveLength(0);
		click(tool, 10, 10);
		click(tool, 90, 90);
		tool.cancel();
		tool.finish();
		expect(objects.state.objects).toHaveLength(0);
	});
});

describe('editing a path\'s points', () => {
	const editing = () => {
		const objects = new AnnotationDocument();
		objects.add(path({ contours: parsePathData('M0 0 L100 0 L200 0') }));
		const editor = new PathPointEditor(model, objects);
		const changes: boolean[] = [];
		editor.onEditingChange((state) => changes.push(state));
		editor.edit('path');
		const nodes = () => (objects.object('path') as PathAnnotation).contours[0]!.nodes;
		return { objects, editor, changes, nodes };
	};

	it('drags a node with its handles in one undo step, and a handle on its own', () => {
		const { objects, editor, nodes } = editing();
		const drag = editor.begin({ x: 100, y: 0 }, 1, false)!;
		drag.update({ x: 100, y: 40 }, 1);
		drag.complete({ x: 100, y: 40 });
		expect(nodes()[1]).toEqual({ point: { x: 100, y: 40 } });
		expect(objects.canUndo).toBe(true);
		objects.undo();
		expect(nodes()[1]).toEqual({ point: { x: 100, y: 0 } });
	});

	it('turns a corner into a curve and back with Alt, and moves a handle alone', () => {
		const { editor, nodes } = editing();
		expect(editor.begin({ x: 100, y: 0 }, 1, true)).toBeNull();
		expect(nodes()[1]!.in!.x).toBeCloseTo(100 - 200 / 3);
		expect(nodes()[1]!.out!.x).toBeCloseTo(100 + 200 / 3);
		expect(nodes()[1]!.out!.y).toBe(0);
		const handle = nodes()[1]!.out!;
		const drag = editor.begin(handle, 1, false)!;
		drag.update({ x: handle.x, y: handle.y + 30 }, 1);
		drag.complete({ x: handle.x, y: handle.y + 30 });
		expect(nodes()[1]!.out!.y).toBe(30);
		expect(nodes()[1]!.in!.y).toBe(0);
		editor.begin({ x: 100, y: 0 }, 1, true);
		expect(nodes()[1]).toEqual({ point: { x: 100, y: 0 } });
	});

	it('removes the chosen node with Delete, and the path once too few nodes are left', () => {
		const { objects, editor, nodes } = editing();
		editor.begin({ x: 100, y: 0 }, 1, false)?.complete({ x: 100, y: 0 });
		expect(editor.removeSelected()).toBe(true);
		expect(nodes()).toHaveLength(2);
		expect(editor.removeSelected()).toBe(false);
		editor.edit('path');
		editor.begin({ x: 0, y: 0 }, 1, false)?.complete({ x: 0, y: 0 });
		editor.removeSelected();
		expect(objects.object('path')).toBeNull();
	});

	it('ends when a press misses the nodes or another item is chosen, and says when it starts and ends', () => {
		const { objects, editor, changes } = editing();
		expect(editor.begin({ x: 150, y: 150 }, 1, false)).toBeNull();
		expect(editor.editing).toBe(false);
		editor.edit('path');
		objects.select(null);
		expect(editor.editing).toBe(false);
		expect(changes).toEqual([true, false, true, false]);
	});
});
