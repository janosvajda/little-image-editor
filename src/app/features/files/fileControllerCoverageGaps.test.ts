import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { FileController } from './fileController';

describe('FileController uncovered behavior', () => {
	beforeEach(() => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		vi.spyOn(window, 'prompt').mockReturnValue('download.png');
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
	});

	const subject = (): { model: CanvasDocument; files: FileController } => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		return { model, files: new FileController(model) };
	};

	it('keeps empty-document commands inert and closes through every public control', async () => {
		const { model, files } = subject();
		await files.save();
		await files.saveAs();
		await files.exportImage();
		files.requestClose();
		expect(files.closeDialog.open).toBe(false);

		model.create({ name: 'closable', width: 2, height: 2, transparent: false, background: '#fff' });
		document.querySelector<HTMLButtonElement>('#quickCloseImageButton')!.click();
		expect(files.closeDialog.open).toBe(true);
		files.closeDialog.querySelector<HTMLButtonElement>('[value="cancel"]')!.click();
		expect(files.closeDialog.open).toBe(false);
		document.querySelector<HTMLButtonElement>('#closeImageButton')!.click();
		document.querySelector<HTMLButtonElement>('#confirmCloseImageButton')!.click();
		expect(model.hasImage).toBe(false);
	});

	it('runs preparation listeners for Save and refuses unsupported transparency', async () => {
		const { model, files } = subject();
		model.create({ name: 'alpha', width: 2, height: 2, transparent: true, background: '#fff' });
		const beforeSave = vi.fn();
		files.onBeforeSave(beforeSave);
		model.savedType = 'image/jpeg';
		model.fileHandle = {
			name: 'alpha.jpeg',
			createWritable: vi.fn().mockResolvedValue({ write: vi.fn(), close: vi.fn() }),
		} as unknown as FileSystemFileHandle;
		vi.mocked(window.confirm).mockReturnValueOnce(false);
		await files.save();
		expect(beforeSave).not.toHaveBeenCalled();
		vi.mocked(window.confirm).mockReturnValueOnce(true);
		await files.save();
		expect(beforeSave).toHaveBeenCalledOnce();
	});

	it('completes fallback download cleanup and distinguishes cancellation from failures', async () => {
		vi.useFakeTimers();
		const { model, files } = subject();
		model.create({ name: 'fallback', width: 2, height: 2, transparent: false, background: '#fff' });
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		await files.saveAs();
		expect(URL.createObjectURL).toHaveBeenCalledOnce();
		vi.runAllTimers();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download');
		vi.useRealTimers();

		const cancelled = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: cancelled });
		await expect(files.saveAs()).resolves.toBeUndefined();
		const failure = new Error('disk unavailable');
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: vi.fn().mockRejectedValue(failure) });
		await expect(files.saveAs()).rejects.toBe(failure);
	});

	it('connects every save command button to its public operation', () => {
		const { model, files } = subject();
		model.create({ name: 'buttons', width: 2, height: 2, transparent: false, background: '#fff' });
		const save = vi.spyOn(files, 'save').mockResolvedValue();
		const saveAs = vi.spyOn(files, 'saveAs').mockResolvedValue();
		const exportImage = vi.spyOn(files, 'exportImage').mockResolvedValue();
		document.querySelector<HTMLButtonElement>('#saveButton')!.click();
		document.querySelector<HTMLButtonElement>('#quickSaveButton')!.click();
		document.querySelector<HTMLButtonElement>('#saveAsButton')!.click();
		document.querySelector<HTMLButtonElement>('#exportButton')!.click();
		expect(save).toHaveBeenCalledTimes(2);
		expect(saveAs).toHaveBeenCalledOnce();
		expect(exportImage).toHaveBeenCalledOnce();
	});
});
