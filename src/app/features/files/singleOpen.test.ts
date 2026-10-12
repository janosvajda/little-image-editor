import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { DocumentType, ImageMimeType } from '../../core/document/appTypes';
import { FileController } from './fileController';
import { NewImageController } from './newImageController';
import { EDITOR_OPEN_PICKER_TYPES, PROJECT_PICKER_TYPE } from './openFileTypes';

function editor() {
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	new NewImageController(model);
	const files = new FileController(model);
	return { model, files };
}

function pickable(file: File) {
	const write = vi.fn();
	const target = {
		name: file.name,
		getFile: vi.fn().mockResolvedValue(file),
		createWritable: vi.fn().mockResolvedValue({ write, close: vi.fn() }),
	} as unknown as FileSystemFileHandle;
	const picker = vi.fn().mockResolvedValue([target]);
	Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: picker });
	return { picker, target, write };
}

afterEach(() => {
	Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
});

describe('one Open for images and projects', () => {
	it('is the only open item in the File menu', () => {
		editor();
		const labels = [...document.querySelectorAll('#fileMenu [role="menuitem"]')].map((item) => item.textContent?.trim());
		expect(labels.filter((label) => label?.startsWith('Open'))).toEqual(['Open…Ctrl/⌘+O']);
		expect(document.querySelector('#openProjectButton')).toBeNull();
	});

	it('opens a picked image as the file Save writes into', async () => {
		const { model, files } = editor();
		const load = vi.spyOn(model, 'load').mockResolvedValue(undefined);
		const { target } = pickable(new File(['x'], 'photo.webp', { type: ImageMimeType.Webp }));
		await files.open();
		expect(load).toHaveBeenCalledOnce();
		expect(model.fileHandle).toBe(target);
		expect(model.savedType).toBe(ImageMimeType.Webp);
	});

	it('falls back to the file input without a picker, and says when a picked file cannot be opened', async () => {
		const { model, files } = editor();
		const click = vi.spyOn(files.fileInput, 'click').mockImplementation(() => undefined);
		await files.open();
		expect(click).toHaveBeenCalledOnce();
		vi.spyOn(model, 'load').mockRejectedValue(new Error('not an image'));
		const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
		pickable(new File(['x'], 'broken.png', { type: ImageMimeType.Png }));
		await files.open();
		expect(alert).toHaveBeenCalledOnce();
		Object.defineProperty(window, 'showOpenFilePicker', {
			configurable: true,
			value: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
		});
		await files.open();
		expect(alert).toHaveBeenCalledOnce();
	});
});
