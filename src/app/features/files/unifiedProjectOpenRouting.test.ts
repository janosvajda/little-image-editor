import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
import { FileController } from './fileController';

describe('Unified project opening', () => {
	it('routes a .limg file selected through Open to project persistence', async () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const files = new FileController(model);
		const openProject = vi.fn().mockResolvedValue(undefined);
		const openRaster = vi.spyOn(model, 'load');
		files.setProjectOpenHandler(openProject);
		const input = document.querySelector<HTMLInputElement>('#fileInput')!;
		const project = new File(['project'], 'artwork.limg', {
			type: PROJECT_MIME_TYPE,
		});
		Object.defineProperty(input, 'files', {
			configurable: true,
			value: [project],
		});

		input.dispatchEvent(new Event('change'));

		await vi.waitFor(() => expect(openProject).toHaveBeenCalledWith(project));
		expect(openRaster).not.toHaveBeenCalled();
		expect(input.value).toBe('');
	});

	it('recognizes extension-only .limg files from operating-system pickers', async () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		const files = new FileController(model);
		const openProject = vi.fn().mockResolvedValue(undefined);
		files.setProjectOpenHandler(openProject);
		const input = document.querySelector<HTMLInputElement>('#fileInput')!;
		const project = new File(['project'], 'ARTWORK.LIMG');
		Object.defineProperty(input, 'files', {
			configurable: true,
			value: [project],
		});

		input.dispatchEvent(new Event('change'));

		await vi.waitFor(() => expect(openProject).toHaveBeenCalledWith(project));
	});
});
