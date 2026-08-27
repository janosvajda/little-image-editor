import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { ProjectCodec } from './projectCodec';
import { ProjectController } from './projectController';
import { PROJECT_MIME_TYPE } from './projectTypes';

function model(): CanvasDocument {
	const subject = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	subject.create({
		name: 'project-source',
		width: 2,
		height: 2,
		transparent: true,
		background: '#ffffff',
	});
	return subject;
}

function ensureExportButton(): void {
	if (document.querySelector('#exportButton')) return;
	const button = document.createElement('button');
	button.id = 'exportButton';
	document.querySelector('#saveAsButton')!.after(button);
}

function handle(name = 'project.limg'): {
	readonly handle: FileSystemFileHandle;
	readonly write: ReturnType<typeof vi.fn>;
	readonly close: ReturnType<typeof vi.fn>;
} {
	const write = vi.fn();
	const close = vi.fn();
	return {
		handle: {
			name,
			createWritable: vi.fn().mockResolvedValue({ write, close }),
		} as unknown as FileSystemFileHandle,
		write,
		close,
	};
}

describe('ProjectController contract', () => {
	beforeEach(() => {
		ensureExportButton();
		Object.defineProperties(window, {
			showOpenFilePicker: { configurable: true, value: undefined },
			showSaveFilePicker: { configurable: true, value: undefined },
		});
	});

	it('saves through the native picker and reuses the project handle', async () => {
		const documentModel = model();
		const destination = handle();
		const picker = vi.fn().mockResolvedValue(destination.handle);
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: picker,
		});
		const controller = new ProjectController(documentModel);

		await controller.save();
		await controller.save();

		expect(picker).toHaveBeenCalledOnce();
		expect(destination.write).toHaveBeenCalledTimes(2);
		expect(destination.close).toHaveBeenCalledTimes(2);
		const blob = destination.write.mock.calls[0]?.[0] as Blob;
		expect(blob.type).toBe(PROJECT_MIME_TYPE);
		expect(JSON.parse(await blob.text())).toMatchObject({
			format: 'little-image-editor-project',
		});
	});

	it('opens a native project handle and restores its document session', async () => {
		const sourceModel = model();
		const source = new ProjectCodec().serialize(sourceModel.snapshotSession());
		const documentModel = model();
		documentModel.close();
		const projectFile = new File([source], 'opened.limg', {
			type: PROJECT_MIME_TYPE,
		});
		const opened = handle('opened.limg');
		Object.assign(opened.handle, {
			getFile: vi.fn().mockResolvedValue(projectFile),
		});
		Object.defineProperty(window, 'showOpenFilePicker', {
			configurable: true,
			value: vi.fn().mockResolvedValue([opened.handle]),
		});
		const controller = new ProjectController(documentModel);

		await controller.open();

		expect(documentModel.hasImage).toBe(true);
		expect(documentModel.baseName).toBe('project-source');
	});

	it('supports download/upload fallback and reports invalid projects', async () => {
		const documentModel = model();
		const controller = new ProjectController(documentModel);
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);
		vi.spyOn(window, 'prompt').mockReturnValue('fallback-project');
		const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

		await controller.save();
		expect(click).toHaveBeenCalledOnce();

		const input =
			document.querySelector<HTMLInputElement>('#projectFileInput')!;
		Object.defineProperty(input, 'files', {
			configurable: true,
			value: [
				new File(['invalid'], 'broken.limg', { type: PROJECT_MIME_TYPE }),
			],
		});
		input.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(alert).toHaveBeenCalled());
	});
});
