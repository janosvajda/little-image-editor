import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { decodeSvg, SVG_MIME_TYPE } from '../../core/document/svgImage';
import type { EditorPlatform, SaveTarget } from '../../platform/editorPlatform';
import { editorPlatform } from '../../platform/editorPlatform';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
import { FileController } from './fileController';
import { fileTypeOfName } from './openFileTypes';

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#ff0000"/></svg>';

/** jsdom draws no images; this one decodes as a browser's does, or fails when told to. */
function decodingImages(fails = false): void {
	class DecodingImage {
		src = '';
		constructor(
			readonly width: number,
			readonly height: number,
		) {}
		decode(): Promise<void> {
			return fails ? Promise.reject(new Error('broken')) : Promise.resolve();
		}
	}
	vi.stubGlobal('Image', DecodingImage);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('opening an SVG file', () => {
	it('decodes it as a picture at the size it asks for, and releases its address', async () => {
		decodingImages();
		const { image, size } = await decodeSvg(new Blob([SQUARE], { type: SVG_MIME_TYPE }));
		expect(size).toEqual({ width: 40, height: 20 });
		expect(image.src).toBe('blob:svg');
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg');
	});

	it('names a picture the browser cannot draw as an invalid SVG', async () => {
		decodingImages(true);
		await expect(decodeSvg(new Blob([SQUARE]))).rejects.toThrow('The file is not a valid SVG image.');
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg');
	});

	it('becomes a new image of its size, saved as a PNG unless chosen otherwise', async () => {
		decodingImages();
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.savedType = ImageMimeType.Jpeg;
		await model.load(new File([SQUARE], 'logo.svg', { type: '' }));
		expect([model.width, model.height]).toEqual([40, 20]);
		expect(model.baseName).toBe('logo');
		expect(model.savedType).toBe(ImageMimeType.Png);
	});

	it('is known by its name, as images and projects are', () => {
		expect(fileTypeOfName('logo.svg')).toBe(SVG_MIME_TYPE);
		expect(fileTypeOfName('photo.jpg')).toBe(ImageMimeType.Jpeg);
		expect(fileTypeOfName('plan.limg')).toBe(PROJECT_MIME_TYPE);
	});

	it('is saved into as SVG, never as pixels, and only by an editor that can write SVG', async () => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'logo', width: 4, height: 4, transparent: false, background: '#ffffff' });
		const { files } = editorPlatform();
		const platform: Pick<EditorPlatform, 'files' | 'dialogs'> = { files, dialogs: { alert: vi.fn(), confirm: async () => true, prompt: async () => null } };
		const written: Blob[] = [];
		const target: SaveTarget = { name: 'logo.svg', createWritable: async () => ({ write: async (blob) => void written.push(blob), close: async () => undefined }) };
		const controller = new FileController(model, undefined, platform);
		await expect(controller.saveInto(target)).rejects.toThrow();
		expect(written).toEqual([]);
		const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: SVG_MIME_TYPE });
		controller.setSvgDocument({ open: vi.fn(), write: () => svg, hasPicturedItems: () => false });
		await controller.saveInto(target);
		expect(written).toEqual([svg]);
		expect(model.fileHandle).toBe(target);
	});
});
