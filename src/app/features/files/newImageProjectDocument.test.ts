import { describe, expect, it } from 'vitest';
import { DocumentType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { NewImageController } from './newImageController';

describe('New image project document type', () => {
	it('offers .limg explicitly while retaining a separate raster export format', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		new NewImageController(model);
		const documentType = document.querySelector<HTMLSelectElement>(
			'#newImageDocumentType',
		)!;
		expect([...documentType.options].map(({ value }) => value)).toEqual([
			DocumentType.Image,
			DocumentType.Project,
		]);
		expect(documentType.options[1]?.text).toContain('.limg');

		documentType.value = DocumentType.Project;
		document.querySelector<HTMLInputElement>('#newImageName')!.value =
			'editable-artwork';
		document.querySelector<HTMLButtonElement>('#createImageButton')!.click();

		expect(model.documentType).toBe(DocumentType.Project);
		expect(model.savedType).toBe('image/png');
	});
});
