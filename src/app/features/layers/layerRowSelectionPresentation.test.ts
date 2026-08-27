import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { ColorPalette } from '../../core/document/colorPalette';
import { ShapeToolId } from '../../core/document/appTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from './layersController';

describe('layer row selection presentation', () => {
	it('selects an object from its row and exposes the selected option state', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'layer-selection',
			width: 100,
			height: 100,
			transparent: false,
			background: ColorPalette.White,
		});
		const objects = new AnnotationDocument();
		objects.add({
			id: 'selectable-shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 10, y: 10, width: 30, height: 20 },
			rotation: 0,
			color: ColorPalette.Black,
			width: 2,
			opacity: 1,
			fill: false,
		});
		objects.select(null);
		const controller = new LayersController(model, objects);
		const row = controller.panel.list.querySelector<HTMLElement>(
			'[data-object-id="selectable-shape"]',
		)!;

		row.click();

		expect(objects.selectedId).toBe('selectable-shape');
		const selectedRow = controller.panel.list.querySelector<HTMLElement>(
			'[data-object-id="selectable-shape"]',
		)!;
		expect(selectedRow.classList.contains('active')).toBe(true);
		expect(selectedRow.getAttribute('aria-selected')).toBe('true');
	});
});
