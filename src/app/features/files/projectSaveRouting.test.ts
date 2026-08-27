import { describe, expect, it, vi } from 'vitest';
import { DocumentType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { FileController } from './fileController';

describe('Primary project save routing', () => {
	it('routes Save and Save As to .limg while leaving Export as a raster action', async () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const files = new FileController(model);
		const saveProject = vi.fn().mockResolvedValue(undefined);
		files.setProjectSaveHandler(saveProject);
		model.create({
			name: 'project',
			width: 2,
			height: 2,
			transparent: true,
			background: '#ffffff',
			documentType: DocumentType.Project,
		});

		await files.save();
		await files.saveAs();

		expect(saveProject).toHaveBeenNthCalledWith(1, false);
		expect(saveProject).toHaveBeenNthCalledWith(2, true);
	});
});
