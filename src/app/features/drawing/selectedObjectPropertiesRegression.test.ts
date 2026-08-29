import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';

describe('selected object properties', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="properties"></div>';
	});

	it('hides whole-object style editing for paint layers', () => {
		const objects = documentWithStroke();
		const parent = document.querySelector<HTMLElement>('#properties')!;
		new SelectedObjectPropertiesController(objects, parent);
		expect(parent.querySelector('.selected-object-options')?.classList).toContain(
			'hidden',
		);
		const color = parent.querySelector<HTMLInputElement>(
			'[aria-label="Selected object color"]',
		)!;
		color.value = '#12ab34';
		color.dispatchEvent(new Event('input', { bubbles: true }));
		color.dispatchEvent(new Event('change', { bubbles: true }));

		expect(objects.selected).toMatchObject({ color: '#000000' });
	});

	it('keeps supported controls available for structured shapes', () => {
		const objects = documentWithShape();
		const parent = document.querySelector<HTMLElement>('#properties')!;
		new SelectedObjectPropertiesController(objects, parent);

		expect(
			parent.querySelector('.selected-object-options')?.classList,
		).not.toContain('hidden');
		expect(
			parent.querySelector('[data-object-property="fill"]')?.classList,
		).not.toContain('hidden');
	});
});

function documentWithStroke(): AnnotationDocument {
	const objects = new AnnotationDocument();
	objects.add({
		id: 'stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 1, y: 1, pressure: 1 },
			{ x: 10, y: 10, pressure: 1 },
		],
		rect: { x: 1, y: 1, width: 9, height: 9 },
		color: '#000000',
		size: 12,
		opacity: 1,
		hardness: 0.8,
		seed: 1,
	});
	return objects;
}

function documentWithShape(): AnnotationDocument {
	const objects = new AnnotationDocument();
	objects.add({
		id: 'shape',
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 1, y: 1, width: 20, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: false,
	});
	return objects;
}
