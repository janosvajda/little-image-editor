import { describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PatternKind, patternOf } from '../../core/geometry/fillPattern';
import { linearGradient } from '../../core/geometry/gradient';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type PathAnnotation, type ShapeAnnotation } from '../annotations/annotationTypes';
import { EditableObjectPropertyId, fillColorOf, setEditableObjectProperty } from '../annotations/editableObjectProperties';
import { PLAIN_ENDS } from '../annotations/lineEnd';
import { DrawingImageActions } from './drawingImageActions';
import { ShapeDrawingGesture } from './gestures/shapeDrawingGesture';
import { PenTool } from './penTool';
import { ShapeStyle } from '../annotations/shapeStyle';

const BOX: ShapeAnnotation = { id: 'box', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x: 0, y: 0, width: 10, height: 10 }, color: '#0000ff', width: 2, opacity: 1, fill: false };

function document2d() {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'fills', width: 50, height: 50, transparent: true, background: '#ffffff' });
	return model;
}

describe('a fill colour like the line colour', () => {
	it('is what an item\'s fill is, or would be once filled', () => {
		expect(fillColorOf(BOX)).toBe('#0000ff');
		expect(fillColorOf({ ...BOX, fillColor: '#ff0000' })).toBe('#ff0000');
		expect(fillColorOf({ ...BOX, fill: true, fillGradient: linearGradient(['#00ff00', '#ffffff']) })).toBe('#00ff00');
		expect(fillColorOf({ ...BOX, fill: true, fillPattern: patternOf(PatternKind.Dots, '#123456') })).toBe('#123456');
		expect(fillColorOf({ id: 't', type: AnnotationObjectTypeId.Text, at: { x: 0, y: 9 }, text: 'a', color: '#000000', size: 9 })).toBeUndefined();
	});

	it('fills an unfilled item when chosen, so the colour shows', () => {
		const item = structuredClone(BOX);
		setEditableObjectProperty(item, EditableObjectPropertyId.FillColor, '#ff0000');
		expect(item).toMatchObject({ fill: true, fillColor: '#ff0000', color: '#0000ff' });
	});

	it('draws new shapes and paths in their style: an outline, a fill without a line, or both', () => {
		const model = document2d();
		const objects = new AnnotationDocument();
		const stroke = { color: '#0000ff', size: 3, opacity: 1 } as never;
		const draw = (shapeStyle: ShapeStyle) => {
			const gesture = new ShapeDrawingGesture(model, objects, ShapeToolId.Rectangle, { x: 1, y: 1 }, () => ({ ...(stroke as object), shapeStyle, fillColor: '#ff0000' }) as never);
			gesture.update({ x: 20, y: 20 });
			gesture.complete({ x: 20, y: 20 });
		};
		draw(ShapeStyle.OutlineAndFill);
		draw(ShapeStyle.Outline);
		draw(ShapeStyle.Fill);
		const [both, outline, fill] = objects.state.objects as ShapeAnnotation[];
		expect(both).toMatchObject({ fill: true, fillColor: '#ff0000', color: '#0000ff', width: 3 });
		expect(outline).toMatchObject({ fill: false, width: 3 });
		expect(outline!.fillColor).toBeUndefined();
		expect(fill).toMatchObject({ fill: true, fillColor: '#ff0000', width: 0 });
		expect(model.overlayContext.fillStyle).toBe('#ff0000');
		const pen = new PenTool(model, objects, () => ({ stroke, shapeStyle: ShapeStyle.Fill, fillColor: '#ff0000', ends: PLAIN_ENDS }));
		pen.begin({ x: 1, y: 1 }, 1).complete();
		pen.begin({ x: 30, y: 1 }, 1).complete();
		pen.finish();
		// An open path cannot be filled, so it keeps its line.
		expect(objects.state.objects.at(-1) as PathAnnotation).toMatchObject({ fill: false, width: 3 });
		pen.begin({ x: 1, y: 1 }, 1).complete();
		pen.begin({ x: 30, y: 1 }, 1).complete();
		pen.begin({ x: 30, y: 30 }, 1).complete();
		pen.begin({ x: 1, y: 1 }, 1).complete();
		expect(objects.state.objects.at(-1) as PathAnnotation).toMatchObject({ fill: true, fillColor: '#ff0000', width: 0 });
	});

	it('is sampled by the picker from what shows, items over the image included', () => {
		const model = document2d();
		const objects = new AnnotationDocument();
		const actions = new DrawingImageActions(model, objects);
		vi.mocked(model.context.getImageData).mockReturnValueOnce(new ImageData(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1));
		expect(actions.sampleColor({ x: 5, y: 5 })).toBe('#010203');
		model.registerCompositeRenderer((context) => {
			vi.mocked(context.getImageData).mockReturnValueOnce(new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1));
		});
		expect(actions.sampleColor({ x: 5, y: 5 })).toBe('#ff0000');
	});
});
