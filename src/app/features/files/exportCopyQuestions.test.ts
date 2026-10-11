import { describe, expect, it, vi } from 'vitest';
import { ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { FileController } from './fileController';
import { NewImageController } from './newImageController';

function layeredImage(transparent: boolean) {
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	new NewImageController(model);
	model.create({ name: 'layered', width: 20, height: 20, transparent, background: '#ffffff' });
	const confirm = vi.fn().mockResolvedValue(false);
	const pickSaveTarget = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
	const files = new FileController(model, () => true, {
		files: { canPickSaveTarget: () => true, pickSaveTarget, canPickOpenTarget: () => false, pickOpenTargets: async () => [], download: vi.fn() },
		dialogs: { confirm, alert: vi.fn(), prompt: vi.fn() },
	});
	return { files, confirm, pickSaveTarget };
}

describe('exporting a copy of a layered image', () => {
	it('does not warn about flattening, since the open document keeps its layers', async () => {
		const { files, confirm, pickSaveTarget } = layeredImage(false);
		await files.exportImage(ImageMimeType.Png);
		expect(confirm).not.toHaveBeenCalled();
		expect(pickSaveTarget).toHaveBeenCalledOnce();
	});

	it('still asks before a format drops transparency', async () => {
		const { files, confirm, pickSaveTarget } = layeredImage(true);
		await files.exportImage(ImageMimeType.Jpeg);
		expect(confirm).toHaveBeenCalledWith(expect.stringContaining('transparency'));
		expect(confirm).not.toHaveBeenCalledWith(expect.stringContaining('flattened'));
		expect(pickSaveTarget).not.toHaveBeenCalled();
	});
});
