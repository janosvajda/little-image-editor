import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
import { FileController } from './fileController';

describe('Project file format selection', () => {
	it('offers .limg and routes Save As through project persistence', async () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const files = new FileController(model);
		const saveProject = vi.fn().mockResolvedValue(undefined);
		files.setProjectSaveHandler(saveProject);
		model.create({
			name: 'layered-artwork',
			width: 2,
			height: 2,
			transparent: true,
			background: '#ffffff',
		});

		const format = document.querySelector<HTMLSelectElement>('#formatSelect')!;
		expect([...format.options].map((option) => option.value)).toContain(
			PROJECT_MIME_TYPE,
		);
		format.value = PROJECT_MIME_TYPE;

		await files.saveAs();

		expect(saveProject).toHaveBeenCalledOnce();
		expect(saveProject).toHaveBeenCalledWith(true);
	});
});
