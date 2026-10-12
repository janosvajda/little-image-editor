import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { downloadTarget, type SaveTarget } from '../../platform/editorPlatform';
import { FileController } from './fileController';
import { NewImageController } from './newImageController';
import { PROJECT_PICKER_TYPE, savePickerTypes } from './openFileTypes';

function target(name: string) {
	const written: Blob[] = [];
	const file: SaveTarget = {
		name,
		createWritable: async () => ({ write: async (contents) => void written.push(contents), close: async () => undefined }),
	};
	return { file, written };
}

function editor(documentType: DocumentType = DocumentType.Image) {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	const files = new FileController(model);
	model.create({ name: 'drawing', width: 4, height: 4, transparent: false, background: '#ffffff', documentType });
	return { model, files };
}

const picking = (file: SaveTarget) => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: vi.fn().mockResolvedValue(file) });

beforeEach(() => {
	Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
	vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('one save for every edition', () => {
	it('hands what is written to a download target over in one piece', async () => {
		const download = vi.fn();
		const file = downloadTarget({ download }, 'picture.png');
		const writer = await file.createWritable();
		await writer.write(new Blob(['a'], { type: ImageMimeType.Png }));
		await writer.write(new Blob(['b']));
		await writer.close();
		expect(download).toHaveBeenCalledOnce();
		const [blob, name] = download.mock.calls[0]!;
		expect(name).toBe('picture.png');
		expect(await (blob as Blob).text()).toBe('ab');
		expect((blob as Blob).type).toBe(ImageMimeType.Png);
	});

});

describe('the File menu', () => {
	it('reads New, Open · Save, Save As, Export · diagrams · Close, with Copy only in Edit and without a format dropdown or separate project save', () => {
		new NewImageController(editor().model);
		const items = [...document.querySelectorAll<HTMLElement>('#fileMenu .menu-popover > button, #fileMenu .menu-popover > .menu-rule')].map((item) =>
			item.classList.contains('menu-rule') ? '|' : item.id,
		);
		expect(items).toEqual([
			'newImageButton',
			'openButton',
			'|',
			'saveButton',
			'saveAsButton',
			'exportButton',
			'|',
			'insertDiagramMenuButton',
			'importDiagramButton',
			'placeImageButton',
			'|',
			'closeImageButton',
		]);
		expect(document.querySelector('#editMenu #copyImageButton')).not.toBeNull();
		expect(document.querySelectorAll('#copyImageButton')).toHaveLength(1);
		expect(document.querySelector('#formatSelect')).toBeNull();
		expect(document.querySelector('#saveProjectButton')).toBeNull();
	});
});
