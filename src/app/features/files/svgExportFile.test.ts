import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { SVG_MIME_TYPE } from '../../core/document/svgFormat';
import type { SaveTarget } from '../../platform/editorPlatform';
import { FileController } from './fileController';
import { ImageExportController } from './imageExportController';

const MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"/>';

function target(name: string) {
	const written: Blob[] = [];
	const file: SaveTarget = {
		name,
		createWritable: async () => ({ write: async (contents) => void written.push(contents), close: async () => undefined }),
	};
	return { file, written };
}

function editor() {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	const files = new FileController(model);
	files.setSvgDocument({ open: vi.fn(), write: () => new Blob([MARKUP], { type: SVG_MIME_TYPE }), hasPicturedItems: () => false });
	model.create({ name: 'diagram', width: 4, height: 4, transparent: false, background: ColorPalette.White, documentType: DocumentType.Project });
	return { model, files };
}

const picking = (...files: SaveTarget[]) => {
	const picker = vi.fn();
	files.forEach((file) => picker.mockResolvedValueOnce(file));
	Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker });
	return picker;
};

beforeEach(() => {
	Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
	vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

describe('exporting SVG', () => {
	it('writes the SVG into a chosen .svg file, keeping the document\'s own file and format', async () => {
		const { model, files } = editor();
		const svg = target('diagram.svg');
		const picker = picking(svg.file);
		const before = { file: model.fileHandle, type: model.savedType, documentType: model.documentType };
		await files.exportImage(SVG_MIME_TYPE);
		expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'diagram.svg' }));
		expect(svg.written).toHaveLength(1);
		expect(svg.written[0]!.type).toBe(SVG_MIME_TYPE);
		expect(await svg.written[0]!.text()).toBe(MARKUP);
		expect({ file: model.fileHandle, type: model.savedType, documentType: model.documentType }).toEqual(before);
	});

	it('reopens the picker with the .svg extension when another name is chosen', async () => {
		const { files } = editor();
		const wrong = target('diagram.png');
		const right = target('diagram.svg');
		const picker = picking(wrong.file, right.file);
		await files.exportImage(SVG_MIME_TYPE);
		expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('.svg'));
		expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ suggestedName: 'diagram.svg' }));
		expect(wrong.written).toHaveLength(0);
		expect(right.written).toHaveLength(1);
	});

	it('downloads a named .svg where no file can be chosen, and does nothing when the name is declined', async () => {
		const { model, files } = editor();
		const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg');
		const prompt = vi.spyOn(window, 'prompt').mockReturnValue('copy');
		await files.exportImage(SVG_MIME_TYPE);
		expect(prompt).toHaveBeenCalledWith(expect.any(String), 'diagram.svg');
		expect(download).toHaveBeenCalledOnce();
		expect(model.fileHandle).toBeNull();
		prompt.mockReturnValue(null);
		await files.exportImage(SVG_MIME_TYPE);
		expect(download).toHaveBeenCalledOnce();
	});

	it('ends quietly when the picker is cancelled, and needs a writer to export', async () => {
		const { files } = editor();
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
		});
		await expect(files.exportImage(SVG_MIME_TYPE)).resolves.toBeUndefined();
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'plain', width: 4, height: 4, transparent: false, background: ColorPalette.White });
		const picker = picking(target('plain.svg').file);
		await new FileController(model).exportImage(SVG_MIME_TYPE);
		expect(picker).not.toHaveBeenCalled();
	});

	it('is offered in the Export dialog after the image formats, with what SVG keeps explained', async () => {
		const { model } = editor();
		const files = { exportImage: vi.fn().mockResolvedValue(undefined) };
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
		const controller = new ImageExportController(model, files);
		controller.open();
		const format = document.querySelector<HTMLSelectElement>('#exportImageFormat')!;
		expect(format.options[format.options.length - 1]!.value).toBe(SVG_MIME_TYPE);
		format.value = SVG_MIME_TYPE;
		format.dispatchEvent(new Event('change'));
		expect(document.querySelector('#exportImageFormatHint')!.textContent).toContain('vectors');
		const submit = document.querySelector<HTMLButtonElement>('#confirmExportImageButton')!;
		expect(submit.textContent).toBe('Export SVG…');
		submit.click();
		await vi.waitFor(() => expect(files.exportImage).toHaveBeenCalledExactlyOnceWith(SVG_MIME_TYPE, { scale: 1, includeImage: true }));
		await vi.waitFor(() => expect(controller.dialog.open).toBe(false));
	});
});
