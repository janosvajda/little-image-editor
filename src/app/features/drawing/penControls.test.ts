import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PathToolId, UtilityToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { parsePathData } from '../../core/geometry/vectorPath';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, LineDash, type PathAnnotation } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const SIZE = { width: 400, height: 300 } as const;

let model: CanvasDocument;
let objects: AnnotationDocument;
let controller: DrawingController;

const pointer = (type: string, x: number, y: number, init: MouseEventInit = {}) =>
	model.overlay.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init }) as unknown as PointerEvent);
const press = (x: number, y: number, init: MouseEventInit = {}) => {
	pointer('pointerdown', x, y, init);
	pointer('pointerup', x, y, init);
};
const key = (name: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
const paths = () => objects.state.objects.filter((item): item is PathAnnotation => item.type === AnnotationObjectTypeId.Path);

beforeEach(() => {
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	objects = new AnnotationDocument();
	controller = new DrawingController(model, undefined, objects);
	model.create({ name: 'pen', ...SIZE, transparent: false, background: '#ffffff' });
	Object.defineProperty(model.overlay, 'getBoundingClientRect', {
		configurable: true,
		value: () => ({ left: 0, top: 0, ...SIZE, right: SIZE.width, bottom: SIZE.height, x: 0, y: 0, toJSON: () => ({}) }),
	});
});

describe('the Pen in the editor', () => {
	it('adds a node per press, previews while the pointer moves, and adds the path on Enter', () => {
		controller.select(PathToolId.Pen);
		press(20, 20);
		pointer('pointermove', 60, 60);
		press(120, 20);
		press(120, 120);
		expect(paths()).toHaveLength(0);
		key('Enter');
		expect(paths()).toHaveLength(1);
		expect(paths()[0]!.contours[0]!.nodes).toHaveLength(3);
	});

	it('drops the path under way on Escape, and finishes it on a double-click or when another tool is chosen', () => {
		controller.select(PathToolId.Pen);
		press(20, 20);
		press(120, 20);
		key('Escape');
		expect(paths()).toHaveLength(0);
		press(20, 20);
		press(120, 20);
		pointer('dblclick', 120, 20);
		expect(paths()).toHaveLength(1);
		press(200, 200);
		press(300, 200);
		controller.select(UtilityToolId.Select);
		expect(paths()).toHaveLength(2);
	});
});

describe('editing a path\'s points in the editor', () => {
	beforeEach(() => {
		objects.add({
			id: 'path',
			type: AnnotationObjectTypeId.Path,
			contours: parsePathData('M100 100 L200 100 L300 100'),
			color: '#000000',
			width: 4,
			opacity: 1,
			fill: false,
			dash: LineDash.Solid,
		});
		controller.select(UtilityToolId.Select);
		pointer('dblclick', 150, 100);
	});

	it('starts on a double-click and drags a node', () => {
		pointer('pointerdown', 200, 100);
		pointer('pointermove', 200, 160);
		pointer('pointerup', 200, 160);
		expect(paths()[0]!.contours[0]!.nodes[1]!.point).toEqual({ x: 200, y: 160 });
	});

	it('switches a node to a curve with Alt, removes the chosen node with Delete, and ends on Escape', () => {
		press(200, 100, { altKey: true });
		expect(paths()[0]!.contours[0]!.nodes[1]!.out).toBeDefined();
		key('Delete');
		expect(paths()[0]!.contours[0]!.nodes).toHaveLength(2);
		key('Escape');
		// After editing, Delete removes the selected item as usual.
		key('Delete');
		expect(paths()).toHaveLength(0);
	});

	it('ends when a press misses the nodes, and that press does what it normally does', () => {
		press(380, 280);
		key('Delete');
		expect(paths()).toHaveLength(1);
		expect(objects.selected).toBeNull();
	});
});

describe('the Pen without items', () => {
	it('does nothing where the document keeps no items', () => {
		// The editor with items keeps Select, so only the one without items draws.
		controller.select(UtilityToolId.Select);
		const plain = new DrawingController(model);
		plain.select(PathToolId.Pen);
		const add = vi.spyOn(objects, 'add');
		press(20, 20);
		key('Enter');
		pointer('dblclick', 20, 20);
		expect(add).not.toHaveBeenCalled();
	});
});
