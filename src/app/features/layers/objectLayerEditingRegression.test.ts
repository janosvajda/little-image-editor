import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { LayersController } from './layersController';

describe('individual object layer controls', () => {
	it('selects, locks, hides, deletes, and restores retained objects', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const objects = new AnnotationDocument();
		const id = 'retained-box';
		objects.add({
			id,
			type: AnnotationObjectTypeId.Box,
			rect: { x: 10, y: 10, width: 40, height: 30 },
			color: '#ff0000',
			width: 2,
			opacity: 1,
			blur: 0,
		});
		const controller = new LayersController(model, objects);
		const objectRow = () =>
			controller.panel.list.querySelector<HTMLElement>(
				`[data-object-id='${id}']`,
			)!;
		objectRow().querySelector<HTMLButtonElement>('.layer-name')!.click();
		expect(model.layers.state.activeLayerId).toBe(CoreLayerId.Objects);
		expect(objects.selectedId).toBe(id);
		objectRow().querySelector<HTMLButtonElement>('.layer-lock')!.click();
		expect(objects.object(id)?.locked).toBe(true);
		expect(objects.selected).toBeNull();
		objectRow().querySelector<HTMLButtonElement>('.layer-lock')!.click();
		expect(objects.object(id)?.locked).toBe(false);
		objectRow().querySelector<HTMLButtonElement>('.layer-visibility')!.click();
		expect(objects.object(id)?.visible).toBe(false);
		objectRow().querySelector<HTMLButtonElement>('.layer-visibility')!.click();
		expect(objects.object(id)?.visible).toBe(true);
		objectRow().querySelector<HTMLButtonElement>('.layer-delete')!.click();
		expect(objects.object(id)).toBeNull();
		expect(objects.canUndo).toBe(true);
		objects.undo();
		expect(objects.object(id)).not.toBeNull();
		controller.panel.list
			.querySelector<HTMLElement>(`[data-layer-id='${CoreLayerId.Image}']`)!
			.querySelector<HTMLButtonElement>('.layer-lock')!
			.click();
		expect(model.layers.isEditable(CoreLayerId.Image)).toBe(false);
	});
});
