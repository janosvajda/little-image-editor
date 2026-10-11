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

		const picker = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker });
		await files.saveAs();
		expect(picker.mock.calls[0]![0].types.map((type: { accept: Record<string, string[]> }) => Object.keys(type.accept))).toContainEqual([
			PROJECT_MIME_TYPE,
		]);

		await files.saveAs(PROJECT_MIME_TYPE);

		expect(saveProject).toHaveBeenCalledOnce();
		expect(saveProject).toHaveBeenCalledWith(true);
	});
});
