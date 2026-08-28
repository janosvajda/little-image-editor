import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { FileController } from './fileController';
import { NewImageController } from './newImageController';

describe('raster layer flattening warning', () => {
	it('warns before raster output without removing editable objects', async () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		new NewImageController(model);
		model.create({
			name: 'layered-image',
			width: 20,
			height: 20,
			transparent: false,
			background: '#ffffff',
		});
		const objects = new AnnotationDocument();
		objects.add({
			id: 'editable-box',
			type: AnnotationObjectTypeId.Box,
			rect: { x: 2, y: 2, width: 10, height: 10 },
			color: '#000000',
			width: 2,
			opacity: 1,
			blur: 0,
		});
		const files = new FileController(
			model,
			() => objects.state.objects.length > 0,
		);
		const picker = vi.fn();
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: picker,
		});
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

		await files.exportImage();

		expect(confirm).toHaveBeenCalledWith(expect.stringContaining('flattened'));
		expect(picker).not.toHaveBeenCalled();
		expect(objects.object('editable-box')).not.toBeNull();
	});
});
