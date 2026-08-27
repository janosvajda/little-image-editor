import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from './layersController';

describe('Layers structural render isolation', () => {
	it('does not rebuild layer rows for transient pointer updates', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const objects = new AnnotationDocument();
		objects.add({
			id: 'moving-box',
			type: AnnotationObjectTypeId.Box,
			rect: { x: 10, y: 10, width: 30, height: 20 },
			color: '#000000',
			width: 2,
			opacity: 1,
			blur: 0,
		});
		const layers = new LayersController(model, objects);
		const before = layers.panel.list.querySelector('[data-object-id="moving-box"]');

		objects.move('moving-box', { x: 5, y: 0 }, false);

		expect(
			layers.panel.list.querySelector('[data-object-id="moving-box"]'),
		).toBe(before);
		objects.commitCurrent();
		expect(
			layers.panel.list.querySelector('[data-object-id="moving-box"]'),
		).not.toBe(before);
	});
});
