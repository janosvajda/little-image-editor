import { describe, expect, it } from 'vitest';
import { ShapeToolId, UtilityToolId } from '../../core/document/appTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { SelectionOverlayRenderer } from '../annotations/selectionOverlayRenderer';
import { ObjectInteractionTool } from '../drawing/objectInteractionTool';
import { DEFAULT_PIVOT, frameAroundPivot, itemPivot, itemPivotPoint, pivotAt, pivotPoint } from './itemPivot';
import { hitsPivot, PIVOT_HANDLE_RADIUS, PivotGesture } from './pivotGesture';

const PRECISION = 6;

function box(overrides: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return { id: 'box', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x: 0, y: 0, width: 20, height: 10 }, color: '#000000', width: 1, opacity: 1, fill: true, ...overrides };
}

function selectedBox(): AnnotationDocument {
	const objects = new AnnotationDocument();
	objects.add(box());
	objects.select('box');
	return objects;
}

describe('item pivot', () => {
	it('defaults to the frame centre and follows the frame’s rotation', () => {
		expect(itemPivot(box())).toEqual(DEFAULT_PIVOT);
		expect(itemPivotPoint(box())).toEqual({ x: 10, y: 5 });
		const turned = pivotPoint({ rect: { x: 0, y: 0, width: 20, height: 10 }, rotation: 90 }, { x: 0, y: 0 });
		expect(turned.x).toBeCloseTo(15, PRECISION);
		expect(turned.y).toBeCloseTo(-5, PRECISION);
	});

	it('finds the pivot at an image point, and a frame around a pivot', () => {
		const geometry = { rect: { x: 0, y: 0, width: 20, height: 10 }, rotation: 0 };
		expect(pivotAt(geometry, { x: 5, y: 10 })).toEqual({ x: 0.25, y: 1 });
		const frame = frameAroundPivot({ width: 20, height: 10 }, 0, { x: 0, y: 0 }, { x: 100, y: 50 });
		expect(frame.rect).toEqual({ x: 100, y: 50, width: 20, height: 10 });
		const turned = frameAroundPivot({ width: 20, height: 10 }, 180, { x: 0, y: 0 }, { x: 0, y: 0 });
		expect(pivotPoint(turned, { x: 0, y: 0 }).x).toBeCloseTo(0, PRECISION);
	});
});

describe('dragging the pivot', () => {
	it('moves only the pivot, as one undo step, and keeps none at the centre', () => {
		const objects = selectedBox();
		const depth = objects.undoDepth;
		const gesture = new PivotGesture(objects, 'box');
		gesture.update({ x: 0, y: 0 });
		gesture.complete({ x: 0, y: 0 });
		expect(objects.object('box')!.pivot).toEqual({ x: 0, y: 0 });
		expect((objects.object('box') as ShapeAnnotation).rect).toEqual(box().rect);
		expect(objects.undoDepth).toBe(depth + 1);
		const back = new PivotGesture(objects, 'box');
		back.update({ x: 10, y: 5 });
		back.complete({ x: 10, y: 5 });
		expect(objects.object('box')!.pivot).toBeUndefined();
	});

	it('records nothing for a press that does not move it, and cancels back', () => {
		const objects = selectedBox();
		const depth = objects.undoDepth;
		new PivotGesture(objects, 'box').complete({ x: 10, y: 5 });
		expect(objects.undoDepth).toBe(depth);
		const cancelled = new PivotGesture(objects, 'box');
		cancelled.update({ x: 0, y: 0 });
		cancelled.cancel();
		expect(objects.object('box')!.pivot).toBeUndefined();
	});

	it('is reached within its handle radius at the view’s scale', () => {
		expect(hitsPivot(box(), { x: 10 + PIVOT_HANDLE_RADIUS, y: 5 }, 1)).toBe(true);
		expect(hitsPivot(box(), { x: 10 + PIVOT_HANDLE_RADIUS + 1, y: 5 }, 1)).toBe(false);
		expect(hitsPivot(box(), { x: 10 + PIVOT_HANDLE_RADIUS + 1, y: 5 }, 2)).toBe(true);
	});

	it('is dragged with Select and Alt only while pivot editing is on, as while animating; a plain drag moves the item', () => {
		const objects = selectedBox();
		const tool = new ObjectInteractionTool(objects);
		expect(tool.cursor(UtilityToolId.Select, { x: 10, y: 5 }, 1, true)).toBe('move');
		expect(tool.begin(UtilityToolId.Select, { x: 10, y: 5 }, 1, null, true)).not.toBeInstanceOf(PivotGesture);
		tool.setPivotEditing(true);
		objects.select('box');
		expect(tool.cursor(UtilityToolId.Select, { x: 10, y: 5 }, 1)).toBe('move');
		expect(tool.begin(UtilityToolId.Select, { x: 10, y: 5 }, 1, null)).not.toBeInstanceOf(PivotGesture);
		objects.select('box');
		expect(tool.cursor(UtilityToolId.Select, { x: 10, y: 5 }, 1, true)).toBe('crosshair');
		expect(tool.begin(UtilityToolId.Select, { x: 10, y: 5 }, 1, null, true)).toBeInstanceOf(PivotGesture);
	});

	it('is shown on the selection only when asked', () => {
		const overlay = new SelectionOverlayRenderer();
		overlay.render(box(), 100, 100, 1);
		expect(overlay.element.querySelector('.selection-pivot')).toBeNull();
		overlay.render(box({ pivot: { x: 0, y: 0 } }), 100, 100, 2, undefined, null, true);
		const mark = overlay.element.querySelector('.selection-pivot')!;
		expect(mark.getAttribute('cx')).toBe('0');
		expect(mark.getAttribute('r')).toBe(String(PIVOT_HANDLE_RADIUS * 2));
	});
});
