import { describe, expect, it } from 'vitest';
import { DocumentType, ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { NewImageController } from './newImageController';

describe('New image file type', () => {
	it('uses one file-type selector with .limg as the layer-preserving default', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		new NewImageController(model);
		const fileType = document.querySelector<HTMLSelectElement>('#newImageFormat')!;
		expect([...fileType.options].map(({ value }) => value)).toEqual([
			'application/vnd.little-image-editor.project+json',
			ImageMimeType.Png,
			ImageMimeType.Jpeg,
			ImageMimeType.Webp,
		]);
		expect(fileType.selectedOptions[0]?.text).toContain('.limg');

		document.querySelector<HTMLInputElement>('#newImageName')!.value =
			'editable-artwork';
		document.querySelector<HTMLButtonElement>('#createImageButton')!.click();

		expect(model.documentType).toBe(DocumentType.Project);
		expect(model.savedType).toBe('image/png');
	});
});
