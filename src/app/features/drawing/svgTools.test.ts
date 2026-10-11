import { beforeEach, describe, expect, it } from 'vitest';
import { PathToolId, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PatternKind, patternOf } from '../../core/geometry/fillPattern';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { type AnnotationObject, AnnotationObjectTypeId, LineDash, type PathAnnotation, type ShapeAnnotation } from '../annotations/annotationTypes';
import { EditableObjectPropertyId } from '../annotations/editableObjectProperties';
import { clipContours } from '../annotations/itemClip';
import { PLAIN_ENDS } from '../annotations/lineEnd';
import { clippingShapeAbove, clipWithShapeAbove, outlineOf, releaseClip } from './clipActions';
import { drawingToolBehavior, isPathTool } from './drawingToolBehavior';
import { SHAPE_MENU_TOOL_DEFINITIONS } from './drawingToolCatalog';
import { PenPieces, PenTool } from './penTool';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';

const PHOTO: ShapeAnnotation = {
	id: 'photo',
	type: AnnotationObjectTypeId.Shape,
	shape: ShapeToolId.Rectangle,
	rect: { x: 0, y: 0, width: 100, height: 100 },
	color: '#333333',
	width: 2,
	opacity: 1,
	fill: true,
	fillColor: '#ffcc00',
};
const DISC: ShapeAnnotation = { ...PHOTO, id: 'disc', shape: ShapeToolId.Ellipse, rect: { x: 25, y: 25, width: 50, height: 50 } };

function documentWith(...items: AnnotationObject[]): AnnotationDocument {
	const objects = new AnnotationDocument();
	for (const item of items) objects.add(structuredClone(item));
	return objects;
}

function change(input: HTMLInputElement | HTMLSelectElement, value: string | boolean): void {
	if (typeof value === 'boolean' && input instanceof HTMLInputElement) input.checked = value;
	else input.value = String(value);
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('the Polyline', () => {
	let model: CanvasDocument;
	beforeEach(() => {
		model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'lines', width: 200, height: 200, transparent: true, background: '#ffffff' });
	});

	it('is a path tool in the Shape tools menu, after the Pen', () => {
		const ids = SHAPE_MENU_TOOL_DEFINITIONS.map(({ id }) => id);
		expect(ids.indexOf(PathToolId.Polyline)).toBe(ids.indexOf(PathToolId.Pen) + 1);
		expect(isPathTool(PathToolId.Polyline)).toBe(true);
		expect(drawingToolBehavior(PathToolId.Polyline)).toEqual(drawingToolBehavior(PathToolId.Pen));
	});

	it('draws straight pieces only: dragging a node pulls out no curve', () => {
		const objects = new AnnotationDocument();
		const style = () => ({ stroke: { color: '#000000', size: 3, opacity: 1 } as never, fill: false, ends: PLAIN_ENDS });
		const polyline = new PenTool(model, objects, style, PenPieces.Straight);
		const gesture = polyline.begin({ x: 10, y: 10 }, 1);
		gesture.update({ x: 60, y: 60 });
		gesture.complete();
		polyline.begin({ x: 100, y: 10 }, 1).complete();
		polyline.finish();
		const [path] = objects.state.objects as [PathAnnotation];
		expect(path.contours[0]!.nodes).toEqual([{ point: { x: 10, y: 10 } }, { point: { x: 100, y: 10 } }]);
		const pen = new PenTool(model, objects, style);
		const curve = pen.begin({ x: 10, y: 10 }, 1);
		curve.update({ x: 60, y: 60 });
		expect(pen.drawing).toBe(true);
	});
});

describe('clipping with the shape above', () => {
	it('is offered only when a shape or a closed path is directly above the item in its layer', () => {
		const objects = documentWith(PHOTO, DISC);
		expect(clippingShapeAbove(objects, objects.object('photo')!)).toMatchObject({ id: 'disc' });
		expect(clippingShapeAbove(objects, objects.object('disc')!)).toBeNull();
		const open: PathAnnotation = { id: 'open', type: AnnotationObjectTypeId.Path, contours: [{ nodes: [{ point: { x: 0, y: 0 } }, { point: { x: 9, y: 9 } }], closed: false }], color: '#000000', width: 1, opacity: 1, fill: false, dash: LineDash.Solid };
		const withLine = documentWith(PHOTO, open);
		expect(clippingShapeAbove(withLine, withLine.object('photo')!)).toBeNull();
		const text = documentWith(PHOTO, { id: 'note', type: AnnotationObjectTypeId.Text, at: { x: 0, y: 20 }, text: 'Hi', color: '#000000', size: 20 });
		expect(clippingShapeAbove(text, text.object('photo')!)).toBeNull();
	});

	it('makes the shape the item\'s clip in one undo step, and releasing it gives the outline back as a path', () => {
		const objects = documentWith(PHOTO, DISC);
		objects.select('photo');
		clipWithShapeAbove(objects);
		expect(objects.state.objects.map(({ id }) => id)).toEqual(['photo']);
		const photo = objects.object('photo')!;
		const outline = clipContours(photo, photo.clip!);
		const xs = outline.flatMap(({ nodes }) => nodes.map(({ point }) => point.x));
		expect(Math.min(...xs)).toBeCloseTo(25);
		expect(Math.max(...xs)).toBeCloseTo(75);
		expect(objects.selected?.id).toBe('photo');
		objects.undo();
		expect(objects.state.objects.map(({ id }) => id)).toEqual(['photo', 'disc']);
		expect(objects.object('photo')!.clip).toBeUndefined();
		objects.redo();
		objects.select('photo');
		releaseClip(objects);
		const [released, path] = objects.state.objects as [ShapeAnnotation, PathAnnotation];
		expect(released.clip).toBeUndefined();
		expect(path).toMatchObject({ type: AnnotationObjectTypeId.Path, fill: false, width: 1 });
		expect(objects.state.objects).toHaveLength(2);
	});

	it('does nothing without a selected item, a shape above, or a clip to release', () => {
		const objects = documentWith(PHOTO);
		clipWithShapeAbove(objects);
		releaseClip(objects);
		objects.select('photo');
		clipWithShapeAbove(objects);
		releaseClip(objects);
		expect(objects.state.objects).toHaveLength(1);
		expect(objects.object('photo')!.clip).toBeUndefined();
	});

	it('takes a shape\'s outline from its own drawing, turned as it is', () => {
		const outline = outlineOf({ ...PHOTO, rect: { x: 0, y: 0, width: 40, height: 20 }, rotation: 90 });
		const points = outline.flatMap(({ nodes }) => nodes.map(({ point }) => point));
		expect(Math.min(...points.map(({ x }) => x))).toBeCloseTo(10);
		expect(Math.max(...points.map(({ y }) => y))).toBeCloseTo(30);
	});
});

describe('the selected-object bar', () => {
	const bar = (...items: AnnotationObject[]) => {
		document.body.innerHTML = '<div id="properties"></div>';
		const objects = documentWith(...items);
		objects.select(items[0]!.id);
		const parent = document.querySelector<HTMLElement>('#properties')!;
		new SelectedObjectPropertiesController(objects, parent);
		const control = (label: string) => parent.querySelector<HTMLInputElement>(`[aria-label="Selected object ${label}"]`)!;
		return { objects, parent, control };
	};

	it('sets a pattern\'s size on its own row, shown only for a pattern', () => {
		const { objects, parent, control } = bar(PHOTO);
		const row = parent.querySelector<HTMLElement>(`[data-object-property="${EditableObjectPropertyId.PatternSize}"]`)!;
		expect(row.classList).toContain('hidden');
		change(control('fill style'), PatternKind.Grid);
		expect(objects.object('photo')!.fillPattern).toMatchObject({ kind: PatternKind.Grid });
		expect(row.classList).not.toContain('hidden');
		expect(row.textContent).toContain('12 px');
		change(control('pattern size'), '20');
		expect(objects.object('photo')!.fillPattern!.size).toBe(20);
		expect(row.textContent).toContain('20 px');
	});

	it('opens the effects from one button, and sets a blur and a shadow live, each change one undo step', () => {
		const { objects, parent, control } = bar({ ...PHOTO, fillPattern: patternOf(PatternKind.Dots, '#000000') });
		const effects = parent.querySelector<HTMLDetailsElement>('.object-effects')!;
		expect(effects.classList).not.toContain('hidden');
		expect(parent.querySelector('.object-effects-button')!.textContent).toBe('Effects');
		const shadowColor = control('shadow colour');
		expect(shadowColor.parentElement!.classList).toContain('hidden');
		change(control('blur'), '6');
		expect(objects.object('photo')!.effects).toEqual({ blur: 6 });
		change(control('shadow'), true);
		expect(objects.object('photo')!.effects!.shadow).toBeDefined();
		expect(shadowColor.parentElement!.classList).not.toContain('hidden');
		expect(parent.querySelector('.object-effects-button')!.classList).toContain('active');
		change(shadowColor, '#ff0000');
		change(control('shadow distance'), '30');
		change(control('shadow softness'), '9');
		expect(objects.object('photo')!.effects!.shadow).toMatchObject({ color: '#ff0000', softness: 9 });
		objects.undo();
		expect(objects.object('photo')!.effects!.shadow!.softness).toBe(4);
		// The button opens the panel already placed under it, and closes it again.
		const button = parent.querySelector<HTMLElement>('.object-effects-button')!;
		button.click();
		expect(effects.open).toBe(true);
		expect(parent.querySelector<HTMLElement>('.object-effects-panel')!.style.top).not.toBe('');
		button.click();
		expect(effects.open).toBe(false);
		effects.open = true;
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(effects.open).toBe(false);
	});

	it('offers Clip when a shape is above, and Release clip once clipped', () => {
		const { objects, parent } = bar(PHOTO, DISC);
		const [clip, release] = [...parent.querySelectorAll<HTMLButtonElement>('.object-clip-actions button')];
		expect([clip!.textContent, clip!.classList.contains('hidden'), release!.classList.contains('hidden')]).toEqual(['Clip', false, true]);
		clip!.click();
		expect(objects.object('photo')!.clip).toBeDefined();
		expect([clip!.classList.contains('hidden'), release!.classList.contains('hidden')]).toEqual([true, false]);
		release!.click();
		expect(objects.object('photo')!.clip).toBeUndefined();
		objects.select(objects.state.objects.at(-1)!.id);
		expect(parent.querySelector('.object-clip-actions')!.classList).toContain('hidden');
	});
});
