import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId, type Point } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { normalizedRect } from '../../core/geometry/geometryHelpers';
import { ShapeHandleId, shapeHandles } from '../../core/geometry/shapeTransformHelpers';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import { AnnotationObjectTypeId, type AnnotationObject, type ArrowAnnotation } from '../annotations/annotationTypes';
import { ProjectCodec, ProjectFormatError } from '../projects/projectCodec';
import { DrawingController } from './drawingController';
import { LayerTransformGesture } from './gestures/layerTransformGesture';

const Surface = { width: 400, height: 300 } as const;
const Start = { x: 200, y: 150 } as const;
const MoveBy = { x: 15, y: 10 } as const;
const QuarterTurn = 90;
const Directions = [
	{ x: 80, y: 60 }, { x: -80, y: 60 }, { x: 80, y: -60 }, { x: -80, y: -60 },
	{ x: 80, y: 0 }, { x: -80, y: 0 }, { x: 0, y: 60 }, { x: 0, y: -60 },
] as const;

let model: CanvasDocument;
let objects: AnnotationDocument;
let drawing: DrawingController;
let overlay: HTMLCanvasElement;

beforeEach(() => {
	const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
	overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
	model = new CanvasDocument(canvas, overlay);
	model.create({ name: 'shape-direction', ...Surface, transparent: true, background: ColorPalette.White });
	overlay.getBoundingClientRect = () => new DOMRect(0, 0, Surface.width, Surface.height);
	objects = new AnnotationDocument();
	drawing = new DrawingController(model, undefined, objects);
});

describe('drawing direction in rotated layers', () => {
	for (const tool of [ShapeToolId.Arrow, ShapeToolId.Line, ShapeToolId.Triangle]) {
		it.each(Directions)(`keeps the ${tool} preview direction for a drag by %o`, (delta) => {
			const layerId = rotatedLayer();
			drawing.select(tool);
			const end = translated(Start, delta);
			drag(Start, end);
			const item = objects.selected!;
			expect(item).toMatchObject({ type: AnnotationObjectTypeId.Shape, shape: tool, rotation: 0 });
			expect(objects.layerOf(item.id)?.id).toBe(layerId);
			expect(objects.layer(layerId)?.rotation).toBeCloseTo(QuarterTurn);
			if (tool !== ShapeToolId.Triangle) expectEndpoints(item, Start, end);
			else expectTriangleTip(item, Start, end);

			objects.moveLayer(layerId, MoveBy);
			const moved = objects.object(item.id)!;
			if (tool !== ShapeToolId.Triangle) expectEndpoints(moved, translated(Start, MoveBy), translated(end, MoveBy));
			else expectTriangleTip(moved, translated(Start, MoveBy), translated(end, MoveBy));
			const saved = structuredClone(objects.snapshotSession());
			objects.undo();
			objects.redo();
			expect(objects.state).toEqual(saved.state);
			const codec = new ProjectCodec();
			const project = codec.parse(codec.serialize(model.snapshotSession(), [], objects.snapshotSession()));
			expect(codec.toEditableObjects(project)).toEqual(saved);
		});
	}
});

describe('endpoint arrows in existing projects', () => {
	it.each(Directions)('preserves endpoint direction through generic move, resize and rotation by %o', (delta) => {
		const arrow: ArrowAnnotation = { id: 'legacy-arrow', type: AnnotationObjectTypeId.Arrow, from: Start, to: translated(Start, delta), color: ColorPalette.Red, width: 4 };
		const shape = genericShape(arrow);
		shape.move(MoveBy);
		expect(arrow.from).toEqual(translated(Start, MoveBy));
		expect(arrow.to).toEqual(translated(translated(Start, delta), MoveBy));
		const before = structuredClone(arrow);
		const frame = normalizedRect(before.from, before.to);
		shape.setGeometry({ rect: { ...frame, width: frame.width * 2, height: frame.height * 2 }, rotation: QuarterTurn });
		expect(arrow.from).toEqual({ x: frame.x + (before.from.x - frame.x) * 2, y: frame.y + (before.from.y - frame.y) * 2 });
		expect(arrow.to).toEqual({ x: frame.x + (before.to.x - frame.x) * 2, y: frame.y + (before.to.y - frame.y) * 2 });
		expect(arrow.rotation).toBe(QuarterTurn);
	});
});

describe('stored drawing direction', () => {
	it.each([{ flipX: 'true' }, { flipY: 1 }, { flipX: null }, { flipY: [] }])('rejects malformed .limg direction %o', (invalid) => {
		drawing.select(ShapeToolId.Arrow);
		drag(Start, translated(Start, Directions[0]!));
		const codec = new ProjectCodec();
		const project = codec.parse(codec.serialize(model.snapshotSession(), [], objects.snapshotSession()));
		const editableObjects = project.editableObjects;
		const state = { ...editableObjects.state, objects: [{ ...editableObjects.state.objects[0]!, ...invalid }] };
		expect(() => codec.parse(JSON.stringify({ ...project, editableObjects: { ...editableObjects, state } }))).toThrow(ProjectFormatError);
	});
});

function rotatedLayer(): string {
	objects.add({ id: 'rectangle', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x: 290, y: 40, width: 80, height: 60 }, color: ColorPalette.RoyalBlue, width: 4, opacity: 1, fill: false });
	const layerId = objects.activeLayer!.id;
	const frame = objects.layerFrame(layerId)!;
	const start = shapeHandles(frame)[ShapeHandleId.Rotate];
	const end = shapeHandles({ ...frame, rotation: QuarterTurn })[ShapeHandleId.Rotate];
	const rotation = new LayerTransformGesture(objects, layerId, frame, start, ShapeHandleId.Rotate, null);
	rotation.update(end);
	rotation.complete(end);
	return layerId;
}

function expectEndpoints(item: AnnotationObject, from: Point, to: Point): void {
	const context = document.createElement('canvas').getContext('2d')!;
	renderAnnotationObject(context, model.canvas, item);
	expect(vi.mocked(context.moveTo).mock.calls[0]).toEqual([from.x, from.y]);
	expect(vi.mocked(context.lineTo).mock.calls[0]).toEqual([to.x, to.y]);
}

function expectTriangleTip(item: AnnotationObject, from: Point, to: Point): void {
	const context = document.createElement('canvas').getContext('2d')!;
	renderAnnotationObject(context, model.canvas, item);
	expect(vi.mocked(context.moveTo).mock.calls[0]).toEqual([(from.x + to.x) / 2, from.y]);
}

function translated(point: Point, delta: Point): Point {
	return { x: point.x + delta.x, y: point.y + delta.y };
}

function drag(from: Point, to: Point): void {
	for (const [type, point] of [['pointerdown', from], ['pointermove', to], ['pointerup', to]] as const)
		overlay.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y }));
}
