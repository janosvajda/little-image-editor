import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import type { EditorPlatform, SaveTarget } from '../../platform/editorPlatform';
import { editorPlatform } from '../../platform/editorPlatform';
import { SVG_MIME_TYPE } from '../../core/document/svgFormat';
import { FileController } from './fileController';
import { fileTypeOfName } from './openFileTypes';

function editor() {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	const alert = vi.fn();
	const platform: Pick<EditorPlatform, 'files' | 'dialogs'> = {
		files: editorPlatform().files,
		dialogs: { alert, confirm: vi.fn().mockResolvedValue(true), prompt: vi.fn().mockResolvedValue(null) },
	};
	return { model, alert, files: new FileController(model, undefined, platform) };
}

function written(name: string): { target: SaveTarget; write: ReturnType<typeof vi.fn> } {
	const write = vi.fn();
	return { write, target: { name, createWritable: async () => ({ write, close: async () => undefined }) } as unknown as SaveTarget };
}

afterEach(() => vi.restoreAllMocks());

describe('saving into a file a host chose', () => {
	it('refuses a file of a kind the editor does not write, says so, and writes nothing', async () => {
		const { model, alert, files } = editor();
		model.create({ name: 'notes', width: 4, height: 4, transparent: false, background: '#ffffff' });
		const { target, write } = written('notes.txt');
		await expect(files.saveInto(target)).rejects.toThrow('Saving was cancelled.');
		expect(alert).toHaveBeenCalledWith(expect.stringContaining('SVG documents and PNG, JPEG or WebP images'));
		expect(write).not.toHaveBeenCalled();
	});
});

describe('opening through the file input', () => {
	it('opens the chosen file, says when it cannot be opened, and is ready for the same file again', async () => {
		const { model, alert, files } = editor();
		const input = files.fileInput;
		const opened = vi.spyOn(model, 'load').mockRejectedValue(new Error('broken'));
		Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'broken.png', { type: 'image/png' })] });
		input.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(alert).toHaveBeenCalledWith('The file could not be opened as an image.'));
		expect(opened).toHaveBeenCalledOnce();
		expect(input.value).toBe('');
	});

	it('does nothing when the input is cleared without a file', () => {
		const { model, files } = editor();
		const opened = vi.spyOn(model, 'load');
		Object.defineProperty(files.fileInput, 'files', { configurable: true, value: [] });
		files.fileInput.dispatchEvent(new Event('change'));
		expect(opened).not.toHaveBeenCalled();
	});
});

describe('a file known by its name', () => {
	it('is an SVG, an image format, or of no type the editor knows', () => {
		expect([fileTypeOfName('drawing.svg'), fileTypeOfName('photo.JPG'), fileTypeOfName('notes.txt')]).toEqual([SVG_MIME_TYPE, 'image/jpeg', '']);
	});
});

describe('choosing the file Save As writes', () => {
	it('stops asking after three files of the wrong kind, saying nothing was saved, and writes nothing', async () => {
		const { model, alert, files } = editor();
		model.create({ name: 'drawing', width: 4, height: 4, transparent: false, background: '#ffffff' });
		const { target, write } = written('drawing.png');
		const picker = vi.fn().mockResolvedValue(target);
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker });
		await files.saveAs();
		expect(picker).toHaveBeenCalledTimes(3);
		expect(alert).toHaveBeenLastCalledWith('The file must use the .svg extension, so nothing was saved.');
		expect(write).not.toHaveBeenCalled();
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
	});
});
