import { beforeEach, describe, expect, it } from 'vitest';
import { ShapeToolId, UtilityToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { AnnotationPanel } from '../annotations/annotationPanel';
import { DrawingController } from './drawingController';

const CanvasSize = 60;

function shape(id: string, extra: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 10, y: 10, width: 20, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		...extra,
	};
}

describe('drawing controller layer shortcuts', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'shortcuts',
			width: CanvasSize,
			height: CanvasSize,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, CanvasSize, CanvasSize);
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, undefined, objects);
	});

	it('deletes the selected editable layer with Delete', () => {
		objects.add(shape('a'));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
		expect(objects.object('a')).toBeNull();
	});

	it('opens the shared crop tool from another toolbar view', () => {
		const panel = new AnnotationPanel((tool) => drawing.select(tool));
		panel.tools.querySelector<HTMLButtonElement>(`[data-tool="${UtilityToolId.Crop}"]`)!.click();
		expect(drawing.tool).toBe(UtilityToolId.Crop);
		expect(document.querySelector(`[data-panel="tools"] [data-tool="${UtilityToolId.Crop}"]`)?.classList).toContain('active');
	});

	it('does not edit locked items, by command or by double-click', () => {
		objects.add(shape('locked', { locked: true }));
		objects.clearSelection();
		drawing.editObject('locked');
		expect(objects.selectedId).toBeNull();
		drawing.select(UtilityToolId.Select);
		model.overlay.dispatchEvent(
			new MouseEvent('dblclick', { bubbles: true, clientX: 15, clientY: 15 }),
		);
		expect(objects.selectedId).toBeNull();
	});
});
