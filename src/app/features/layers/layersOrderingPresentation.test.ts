import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { ShapeToolId } from '../../core/document/appTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from './layersController';

describe('LayersController stacking presentation', () => {
	it('shows frontmost layers first and exposes ordering actions', () => {
		const objects = new AnnotationDocument();
		for (const id of ['back', 'front']) {
			objects.createLayer();
			objects.add({
				id,
				type: AnnotationObjectTypeId.Shape,
				shape: ShapeToolId.Rectangle,
				rect: { x: 0, y: 0, width: 20, height: 20 },
				color: '#000000',
				width: 2,
				opacity: 1,
				fill: false,
			});
		}
		const layerOf = (itemId: string) => objects.layerOf(itemId)!.id;
		const controller = new LayersController(
			new CanvasDocument(
				document.querySelector<HTMLCanvasElement>('#canvas')!,
				document.querySelector<HTMLCanvasElement>('#overlay')!,
			),
			objects,
		);
		const rows = controller.panel.list.querySelectorAll<HTMLElement>(
			'.layer-object-row',
		);

		expect(rows[0]?.dataset.contentLayerId).toBe(layerOf('front'));
		expect(rows[1]?.dataset.contentLayerId).toBe(layerOf('back'));
		expect(rows[0]?.querySelector<HTMLButtonElement>('.layer-forward')?.disabled)
			.toBe(true);
		rows[1]?.querySelector<HTMLButtonElement>('.layer-forward')?.click();
		expect(objects.state.objects.map(({ id }) => id)).toEqual([
			'front',
			'back',
		]);
	});
});
