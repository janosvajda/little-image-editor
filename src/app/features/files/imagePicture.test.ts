import { describe, expect, it, vi } from 'vitest';
import { ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { imagePicture } from './imagePicture';

function documentModel(): CanvasDocument {
	return new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
}

describe('a picture of the whole image', () => {
	it('draws every layer and object, scaled so its longer side fits the asked size', async () => {
		const model = documentModel();
		model.create({ name: 'wide', width: 2000, height: 500, transparent: false, background: '#ffffff' });
		const composite = vi.spyOn(model, 'compositeCanvas');
		const picture = await imagePicture(model, 400);
		expect(composite).toHaveBeenCalled();
		expect(picture).toMatchObject({ width: 400, height: 100, imageWidth: 2000, imageHeight: 500 });
		expect(picture.png.type).toBe(ImageMimeType.Png);
	});

	it('keeps a small image at its own size and refuses when there is no image', async () => {
		const model = documentModel();
		await expect(imagePicture(model, 400)).rejects.toThrow('No image is open');
		model.create({ name: 'icon', width: 32, height: 16, transparent: true, background: '#ffffff' });
		expect(await imagePicture(model, 400)).toMatchObject({ width: 32, height: 16 });
	});
});
