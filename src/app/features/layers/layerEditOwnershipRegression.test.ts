import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from './layersController';

describe('layer object edit ownership', () => {
	it('requests canvas edit ownership for the exact selected object', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const objects = new AnnotationDocument();
		const objectId = 'editable-object';
		objects.add({
			id: objectId,
			type: AnnotationObjectTypeId.Box,
			rect: { x: 10, y: 10, width: 20, height: 20 },
			color: '#000000',
			width: 2,
			opacity: 1,
			blur: 0,
		});
		const controller = new LayersController(model, objects);
		const editRequested = vi.fn();
		controller.onEditRequested(editRequested);

		controller.panel.list
			.querySelector<HTMLElement>(`[data-object-id='${objectId}']`)!
			.querySelector<HTMLButtonElement>('.layer-edit')!
			.click();

		expect(editRequested).toHaveBeenCalledWith(objectId);
		expect(objects.selectedId).toBe(objectId);
	});
});
