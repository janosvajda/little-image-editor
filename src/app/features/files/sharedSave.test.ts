import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { downloadTarget, type SaveTarget } from '../../platform/editorPlatform';
import { ProjectController } from '../projects/projectController';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
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
	const projects = new ProjectController(model);
	files.setProjectSaveHandler((saveAs) => projects.save(saveAs));
	files.setProjectOpenHandler((file, chosen) => projects.openFile(file, chosen));
	model.create({ name: 'drawing', width: 4, height: 4, transparent: false, background: '#ffffff', documentType });
	return { model, files };
}

const picking = (file: SaveTarget) => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: vi.fn().mockResolvedValue(file) });

beforeEach(() => {
	Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
	vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('one save for every edition', () => {
	it('saves a file a host chose by its name: a .limg as a project, an image name as that image', async () => {
		const { model, files } = editor();
		const project = target('board.limg');
		await files.saveInto(project.file);
		expect(project.written[0]!.type).toBe(PROJECT_MIME_TYPE);
		expect(model.fileHandle).toBe(project.file);
		expect(model.documentType).toBe(DocumentType.Project);
		const image = target('board.webp');
		vi.spyOn(model, 'toBlob').mockResolvedValue(new Blob(['webp'], { type: ImageMimeType.Webp }));
		await files.saveInto(image.file);
		expect(model.savedType).toBe(ImageMimeType.Webp);
		expect(model.fileHandle).toBe(image.file);
	});

	it('saves an image as a project when Save As is given a .limg name, and Save keeps writing there', async () => {
		const { model, files } = editor();
		const project = target('kept.limg');
		picking(project.file);
		await files.saveAs();
		expect(project.written).toHaveLength(1);
		expect(project.written[0]!.type).toBe(PROJECT_MIME_TYPE);
		await files.save();
		expect(project.written).toHaveLength(2);
		expect(model.baseName).toBe('drawing');
	});

	it('offers the document\'s format first, then the other images, then a project', () => {
		const types = savePickerTypes(ImageMimeType.Jpeg);
		expect(Object.keys(types[0]!.accept)).toEqual([ImageMimeType.Jpeg]);
		expect(types.at(-1)).toBe(PROJECT_PICKER_TYPE);
		expect(types).toHaveLength(5);
	});

	it('downloads where no file can be chosen, in the format of the typed name, without keeping the download as the file', async () => {
		const { model, files } = editor();
		const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:saved');
		vi.spyOn(window, 'prompt').mockReturnValue('copy.limg');
		await files.saveAs();
		expect(download).toHaveBeenCalledOnce();
		expect(model.fileHandle).toBeNull();
		vi.mocked(window.prompt).mockReturnValue('copy');
		vi.spyOn(model, 'toBlob').mockResolvedValue(new Blob(['png']));
		await files.saveAs();
		expect(download).toHaveBeenCalledTimes(2);
		expect(model.fileHandle).toBeNull();
	});

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

	it('asks nothing when a project is chosen, even for an image with editable content', async () => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		const files = new FileController(model, () => true);
		const projects = new ProjectController(model);
		files.setProjectSaveHandler((saveAs) => projects.save(saveAs));
		model.create({ name: 'layered', width: 4, height: 4, transparent: false, background: '#ffffff' });
		const confirm = vi.mocked(window.confirm);
		confirm.mockClear();
		picking(target('layered.limg').file);
		await files.saveAs();
		expect(confirm).not.toHaveBeenCalled();
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
