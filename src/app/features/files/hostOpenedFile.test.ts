import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import type { OpenTarget } from '../../platform/editorPlatform';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
import { FileController } from './fileController';

const Surface = { width: 12, height: 8 } as const;

function target(file: File, written: Blob[] = []): OpenTarget {
	return {
		name: file.name,
		getFile: async () => file,
		createWritable: async () => ({
			write: async (contents) => void written.push(contents),
			close: async () => undefined,
		}),
	};
}

let model: CanvasDocument;

beforeEach(() => {
	model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	// Like the real load, keeps the format chosen for the document.
	vi.spyOn(model, 'load').mockImplementation(async (file) => {
		model.create({ name: file.name, ...Surface, transparent: false, background: '#ffffff', format: model.savedType });
	});
});

describe('a file opened by a host', () => {
	it('opens an image in its own format and saves back into the same file', async () => {
		const written: Blob[] = [];
		const files = new FileController(model);
		const jpeg = new File(['jpeg'], 'photo.jpg', { type: ImageMimeType.Jpeg });
		await files.openTarget(target(jpeg, written));
		expect(model.savedType).toBe(ImageMimeType.Jpeg);
		expect(model.fileHandle?.name).toBe('photo.jpg');
		vi.spyOn(model, 'toBlob').mockResolvedValue(new Blob(['saved']));
		await files.save();
		expect(written).toHaveLength(1);
	});

	it('hands a project, with its file, to the project handler', async () => {
		const files = new FileController(model);
		const openProject = vi.fn().mockResolvedValue(undefined);
		files.setProjectOpenHandler(openProject);
		const project = new File(['{}'], 'layers.limg', { type: PROJECT_MIME_TYPE });
		const opened = target(project);
		await files.openTarget(opened);
		expect(openProject).toHaveBeenCalledWith(project, opened);
		expect(model.load).not.toHaveBeenCalled();
	});
});
