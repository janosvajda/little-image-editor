import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { CropSelectionKind } from './cropSelectionTypes';
import { CropTool } from './cropTool';
import type { StrokeOptions } from './drawingHelpers';
import { PaintStrokeGesture } from './gestures/paintStrokeGesture';
import { ObjectTransformGesture, ObjectTransformKind } from './gestures/objectTransformGesture';

const CanvasSize = 160;
const Start = { x: 20, y: 20 } as const;
const End = { x: 80, y: 80 } as const;
const Pressure = 1;
const Style: StrokeOptions = { color: '#123456', size: 4, opacity: 1, hardness: 1 };

describe('drawing gesture lifecycle', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({ name: 'gesture-lifecycle', width: CanvasSize, height: CanvasSize, transparent: true, background: '#ffffff' });
		objects = new AnnotationDocument();
	});

	it('commits one undo entry for a completed paint gesture', () => {
		const before = objects.snapshotSession();
		const gesture = paint();
		gesture.update(End, Pressure);
		gesture.update({ x: End.x, y: Start.y }, Pressure);
		expect(objects.snapshotSession().historyIndex).toBe(before.historyIndex);
		gesture.complete(End);
		const painted = objects.snapshotSession();
		expect(painted.historyIndex).toBe(before.historyIndex + 1);
		objects.undo();
		expect(objects.state).toEqual(before.state);
		objects.redo();
		expect(objects.snapshotSession()).toEqual(painted);
	});

	it('cancels a new layer without leaving transient content or an undo entry', () => {
		const before = objects.snapshotSession();
		const gesture = paint();
		gesture.update(End, Pressure);
		expect(objects.state.objects).toHaveLength(1);
		gesture.cancel();
		expect(objects.snapshotSession()).toEqual(before);
		expect(objects.renderState.interactionActive).toBe(false);
	});

	it('restores redo history after cancelling an edit to an existing paint layer', () => {
		paint().complete(End);
		paint().complete(End);
		objects.undo();
		const before = objects.snapshotSession();
		const gesture = paint();
		gesture.update(End, Pressure);
		gesture.cancel();
		expect(objects.snapshotSession()).toEqual(before);
		expect(objects.canRedo).toBe(true);
	});

	it('transforms the captured layer even when selection changes during the gesture', () => {
		const rectangle = { x: Start.x, y: Start.y, width: End.x, height: End.y };
		for (const id of ['first', 'second']) objects.add({ id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: rectangle, color: Style.color, width: Style.size, opacity: Style.opacity, fill: false });
		objects.select('first');
		const gesture = new ObjectTransformGesture(objects, 'first', Start, { kind: ObjectTransformKind.Move });
		objects.select('second');
		gesture.update(End);
		gesture.complete(End);
		expect(objects.object('first')?.rect).toMatchObject({ x: End.x, y: End.y });
		expect(objects.object('second')?.rect).toEqual(rectangle);
	});

	it('discards a crop draft without extracting pixels on a later pointer release', () => {
		const before = objects.snapshotSession();
		const crop = new CropTool(model, objects);
		const gesture = crop.begin(Start, CropSelectionKind.Rectangle);
		gesture.update(End, Pressure);
		gesture.cancel();
		gesture.complete(End);
		expect(objects.snapshotSession()).toEqual(before);
	});

	function paint(): PaintStrokeGesture {
		return new PaintStrokeGesture(objects, model, PaintToolId.Brush, Style, Start, Pressure);
	}
});
