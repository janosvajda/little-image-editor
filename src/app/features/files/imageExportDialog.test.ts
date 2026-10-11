import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ImageMimeType } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { ImageExportController } from './imageExportController';

const Size = { width: 64, height: 64 } as const;
const previewUrl = 'blob:export-preview';
let model: CanvasDocument;
const files = { exportImage: vi.fn<(format: typeof ImageMimeType[keyof typeof ImageMimeType]) => Promise<void>>() };
const createUrl = vi.fn(() => previewUrl);
const revokeUrl = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	files.exportImage.mockResolvedValue(undefined);
	const OriginalUrl = URL;
	vi.stubGlobal('URL', class extends OriginalUrl {
		static createObjectURL = createUrl;
		static revokeObjectURL = revokeUrl;
	});
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
});
afterEach(() => vi.unstubAllGlobals());

function createImage(): void {
	model.create({ name: 'app-icon', ...Size, transparent: true, background: ColorPalette.White, documentType: DocumentType.Project });
}

describe('exporting through a host-visible dialog', () => {
	it('is disabled until there is an image and displays original dimensions with PNG selected', async () => {
		const controller = new ImageExportController(model, files);
		const button = document.querySelector<HTMLButtonElement>('#quickExportButton')!;
		expect(button.disabled).toBe(true);
		controller.open();
		expect(controller.dialog.open).toBe(false);
		createImage();
		button.click();
		expect(button.disabled).toBe(false);
		expect(controller.dialog.open).toBe(true);
		expect(document.querySelector('#exportImageDimensions')!.textContent).toContain(`${Size.width} × ${Size.height}`);
		expect(document.querySelector<HTMLSelectElement>('#exportImageFormat')!.value).toBe(ImageMimeType.Png);
		await vi.waitFor(() => expect(document.querySelector<HTMLImageElement>('#exportImagePreview')!.src).toBe(previewUrl));
		controller.dialog.close();
		controller.dialog.dispatchEvent(new Event('close'));
		expect(revokeUrl).toHaveBeenCalledWith(previewUrl);
		model.close();
		expect(button.disabled).toBe(true);
	});

	it('exports a PNG copy without changing the project format, file handle or document history', async () => {
		createImage();
		const controller = new ImageExportController(model, files);
		const before = model.snapshotSession();
		controller.open();
		document.querySelector<HTMLButtonElement>('#confirmExportImageButton')!.click();
		await vi.waitFor(() => expect(controller.dialog.open).toBe(false));
		expect(files.exportImage).toHaveBeenCalledExactlyOnceWith(ImageMimeType.Png);
		expect(model.snapshotSession()).toEqual(before);
	});

	it('uses the shared format choices and describes JPEG transparency accurately', async () => {
		createImage();
		const controller = new ImageExportController(model, files);
		controller.open();
		const format = document.querySelector<HTMLSelectElement>('#exportImageFormat')!;
		format.value = ImageMimeType.Jpeg;
		format.dispatchEvent(new Event('change'));
		expect(document.querySelector('#exportImageFormatHint')!.textContent).toContain('does not support transparency');
		expect(document.querySelector('#confirmExportImageButton')!.textContent).toBe('Export JPEG…');
		document.querySelector<HTMLButtonElement>('#confirmExportImageButton')!.click();
		await vi.waitFor(() => expect(files.exportImage).toHaveBeenCalledWith(ImageMimeType.Jpeg));
	});

	it('keeps failures visible and allows retry after a failed write', async () => {
		createImage();
		const controller = new ImageExportController(model, files);
		files.exportImage.mockRejectedValueOnce(new Error('The folder is read-only.'));
		controller.open();
		const button = document.querySelector<HTMLButtonElement>('#confirmExportImageButton')!;
		button.click();
		await vi.waitFor(() => expect(document.querySelector('#exportImageError')!.textContent).toBe('The folder is read-only.'));
		expect(controller.dialog.open).toBe(true);
		expect(button.disabled).toBe(false);
		button.click();
		await vi.waitFor(() => expect(controller.dialog.open).toBe(false));
	});

	it('does not submit twice while the host is writing and closes when the document is closed', async () => {
		createImage();
		const controller = new ImageExportController(model, files);
		let finish!: () => void;
		files.exportImage.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
		controller.open();
		const button = document.querySelector<HTMLButtonElement>('#confirmExportImageButton')!;
		button.click(); button.click();
		expect(files.exportImage).toHaveBeenCalledOnce();
		expect(button.disabled).toBe(true);
		model.close();
		expect(controller.dialog.open).toBe(false);
		finish();
		await vi.waitFor(() => expect(button.disabled).toBe(false));
	});

	it('ignores a preview that finishes after the dialog closes', async () => {
		createImage();
		const controller = new ImageExportController(model, files);
		controller.open();
		controller.dialog.close();
		await Promise.resolve(); await Promise.resolve();
		expect(createUrl).not.toHaveBeenCalled();
	});
});
