import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageMimeType } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { SVG_MIME_TYPE } from '../../core/document/svgFormat';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { encodeCanvas, encodedSize } from './canvasHelpers';
import { FileController } from './fileController';
import { ImageExportController } from './imageExportController';
import { svgDocument } from './svgExport';

let model: CanvasDocument;

beforeEach(() => {
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'poster', width: 400, height: 200, transparent: true, background: ColorPalette.White });
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Captures what each canvas is asked to encode. */
function encodingCalls() {
	return vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback) {
		done(new Blob(['x'.repeat(2048)]));
	});
}

describe('encoding an export', () => {
	it('writes at a scale, with a quality and over a background, kept within a canvas\'s size', async () => {
		const calls = encodingCalls();
		const source = document.createElement('canvas');
		source.width = 400;
		source.height = 200;
		await encodeCanvas(source, ImageMimeType.Jpeg, { scale: 0.5, quality: 0.4, background: '#ff0000' });
		const output = calls.mock.contexts[0] as HTMLCanvasElement;
		expect([output.width, output.height]).toEqual([200, 100]);
		expect(calls.mock.calls[0]!.slice(1)).toEqual([ImageMimeType.Jpeg, 0.4]);
		const context = output.getContext('2d')!;
		expect(context.fillStyle).toBe('#ff0000');
		expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 200, 100);
		await encodeCanvas(source, ImageMimeType.Png);
		const plain = (calls.mock.contexts[1] as HTMLCanvasElement).getContext('2d')!;
		expect(plain.fillRect).not.toHaveBeenCalled();
		expect(encodedSize(10_000, 100, 3)).toEqual({ width: 16_384, height: 164 });
		expect(encodedSize(1, 1, 0.01)).toEqual({ width: 1, height: 1 });
	});

	it('writes an SVG that asks for a scaled size, with or without the image\'s own pixels', () => {
		vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
		const root = (markup: string) => new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
		const scaled = root(svgDocument(model, new AnnotationDocument().state, { scale: 2, includeImage: false }));
		expect([scaled.getAttribute('width'), scaled.getAttribute('height'), scaled.getAttribute('viewBox')]).toEqual(['800', '400', '0 0 400 200']);
		expect(scaled.querySelector('image')).toBeNull();
		expect(root(svgDocument(model, new AnnotationDocument().state)).querySelector('image')).not.toBeNull();
	});
});

describe('exporting from the File menu', () => {
	it('opens the Export dialog where there is one, and exports with its settings without asking again', async () => {
		const files = new FileController(model);
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const open = vi.fn();
		files.setExportDialog(open);
		await files.exportImage();
		expect(open).toHaveBeenCalledOnce();
		const written: Blob[] = [];
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: vi.fn().mockResolvedValue({ name: 'poster.jpg', createWritable: async () => ({ write: async (blob: Blob) => void written.push(blob), close: async () => undefined }) }),
		});
		const toBlob = vi.spyOn(model, 'toBlob').mockResolvedValue(new Blob(['jpeg']));
		const options = { scale: 0.5, quality: 0.6, background: '#000000' };
		await files.exportImage(ImageMimeType.Jpeg, options);
		expect(confirm).not.toHaveBeenCalled();
		expect(toBlob).toHaveBeenCalledWith(ImageMimeType.Jpeg, options);
		expect(written).toHaveLength(1);
		const svg = { open: vi.fn(), write: vi.fn(() => new Blob(['<svg/>'])), hasPicturedItems: () => false };
		files.setSvgDocument(svg);
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: vi.fn().mockResolvedValue({ name: 'poster.svg', createWritable: async () => ({ write: async () => undefined, close: async () => undefined }) }),
		});
		await files.exportImage(SVG_MIME_TYPE, { scale: 2, includeImage: false });
		expect(svg.write).toHaveBeenCalledWith({ scale: 2, includeImage: false });
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
	});
});

describe('the Export dialog', () => {
	function dialog() {
		const files = { exportImage: vi.fn().mockResolvedValue(undefined) };
		const svg = { write: vi.fn(() => new Blob(['<svg/>'.repeat(10)])) };
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
		const controller = new ImageExportController(model, files, svg);
		const $ = <Element extends HTMLElement>(selector: string) => document.querySelector<Element>(selector)!;
		const shown = () => [...document.querySelectorAll<HTMLElement>('[data-export-option]')].filter((row) => !row.classList.contains('hidden')).map((row) => row.dataset.exportOption);
		const choose = (format: string) => {
			$<HTMLSelectElement>('#exportImageFormat').value = format;
			$<HTMLSelectElement>('#exportImageFormat').dispatchEvent(new Event('change'));
		};
		const set = (selector: string, value: string | boolean) => {
			const input = $<HTMLInputElement>(selector);
			if (typeof value === 'boolean') input.checked = value;
			else input.value = value;
			input.dispatchEvent(new Event('input'));
		};
		return { files, svg, controller, $, shown, choose, set };
	}

	it('shows each format\'s own settings, and sizes with the pixels they make', () => {
		const { controller, $, shown, choose, set } = dialog();
		controller.open();
		expect([...$<HTMLSelectElement>('#exportImageScale').options].map(({ text }) => text)).toContain('50% · 200 × 100 px');
		expect($<HTMLSelectElement>('#exportImageScale').value).toBe('1');
		expect(shown()).toEqual(['transparency']);
		set('#exportImageTransparent', false);
		expect(shown()).toEqual(['transparency', 'background']);
		choose(ImageMimeType.Jpeg);
		expect(shown()).toEqual(['quality', 'background']);
		expect($('#exportImageQualityValue').textContent).toBe('92%');
		expect($('#exportImageFormatHint').textContent).toContain('compressed');
		choose(ImageMimeType.Webp);
		expect(shown()).toEqual(['quality', 'transparency', 'background']);
		choose(SVG_MIME_TYPE);
		expect(shown()).toEqual(['includeImage']);
		choose(ImageMimeType.Png);
		expect($('#exportImageFormatHint').textContent).toContain('lossless');
	});

	it('exports with the chosen settings, only those the format has', async () => {
		const { files, controller, $, choose, set } = dialog();
		controller.open();
		choose(ImageMimeType.Jpeg);
		set('#exportImageQuality', '55');
		set('#exportImageBackground', '#123456');
		$<HTMLSelectElement>('#exportImageScale').value = '2';
		$('#confirmExportImageButton').click();
		await vi.waitFor(() => expect(files.exportImage).toHaveBeenCalledWith(ImageMimeType.Jpeg, { scale: 2, quality: 0.55, background: '#123456' }));
		controller.open();
		choose(ImageMimeType.Png);
		set('#exportImageTransparent', true);
		$('#confirmExportImageButton').click();
		await vi.waitFor(() => expect(files.exportImage).toHaveBeenLastCalledWith(ImageMimeType.Png, { scale: 1 }));
		controller.open();
		choose(SVG_MIME_TYPE);
		set('#exportImageIncludeImage', false);
		$('#confirmExportImageButton').click();
		await vi.waitFor(() => expect(files.exportImage).toHaveBeenLastCalledWith(SVG_MIME_TYPE, { scale: 1, includeImage: false }));
	});

	it('says how big the file will be once the settings stop changing', async () => {
		vi.useFakeTimers();
		const { svg, controller, $, choose } = dialog();
		vi.spyOn(model, 'toBlob').mockResolvedValue(new Blob(['x'.repeat(2048)]));
		controller.open();
		expect($('#exportImageEstimate').textContent).toBe('');
		await vi.advanceTimersByTimeAsync(300);
		expect($('#exportImageEstimate').textContent).toBe('Estimated file size: 2.0 KB');
		choose(SVG_MIME_TYPE);
		await vi.advanceTimersByTimeAsync(300);
		expect(svg.write).toHaveBeenCalledWith({ scale: 1, includeImage: true });
		expect($('#exportImageEstimate').textContent).toBe('Estimated file size: 60 bytes');
		vi.spyOn(model, 'toBlob').mockRejectedValue(new Error('no'));
		choose(ImageMimeType.Png);
		await vi.advanceTimersByTimeAsync(300);
		expect($('#exportImageEstimate').textContent).toBe('');
		choose(ImageMimeType.Jpeg);
		controller.dialog.close();
		await vi.advanceTimersByTimeAsync(300);
		expect($('#exportImageEstimate').textContent).toBe('');
	});
});
