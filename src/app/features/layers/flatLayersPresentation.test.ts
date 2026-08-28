import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from './layersController';

describe('flat Layers toolbar presentation', () => {
	it('shows actual object and image layers without an artificial object group', () => {
		const objects = new AnnotationDocument();
		objects.add({
			id: 'visible-layer',
			type: AnnotationObjectTypeId.Box,
			rect: { x: 2, y: 2, width: 10, height: 10 },
			color: '#000000',
			width: 2,
			opacity: 1,
			blur: 0,
		});
		const controller = new LayersController(
			new CanvasDocument(
				document.querySelector<HTMLCanvasElement>('#canvas')!,
				document.querySelector<HTMLCanvasElement>('#overlay')!,
			),
			objects,
		);

		expect(
			controller.panel.list.querySelector(
				`[data-layer-id="${CoreLayerId.Objects}"]`,
			),
		).toBeNull();
		expect(
			controller.panel.list.querySelector('[data-object-id="visible-layer"]'),
		).not.toBeNull();
		expect(
			controller.panel.list.querySelector(
				`[data-layer-id="${CoreLayerId.Image}"]`,
			),
		).not.toBeNull();
	});
});
