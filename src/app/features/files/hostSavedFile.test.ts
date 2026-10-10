import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageMimeType } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import type { EditorPlatform, SaveTarget } from '../../platform/editorPlatform';
import { editorPlatform } from '../../platform/editorPlatform';
import { FileController } from './fileController';

const Surface = { width: 12, height: 8 } as const;

function target(name: string, written: Blob[]): SaveTarget {
	return {
		name,
		createWritable: async () => ({
			write: async (contents) => void written.push(contents),
			close: async () => undefined,
		}),
	};
}

function platformAnswering(confirmed: boolean): Pick<EditorPlatform, 'files' | 'dialogs'> {
	const { files, dialogs } = editorPlatform();
	return { files, dialogs: { ...dialogs, confirm: async () => confirmed } };
}

let model: CanvasDocument;

beforeEach(() => {
	model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	model.create({ name: 'new', ...Surface, transparent: true, background: '#ffffff', format: ImageMimeType.Png });
	vi.spyOn(model, 'toBlob').mockImplementation(async (type) => new Blob([type]));
});

describe('saving into a file a host chose', () => {
	it('writes the format the file name says and keeps saving there', async () => {
		const written: Blob[] = [];
		const files = new FileController(model, undefined, platformAnswering(true));
		const chosen = target('sketch.webp', written);
		await files.saveInto(chosen);
		expect(model.toBlob).toHaveBeenCalledWith(ImageMimeType.Webp);
		expect(written).toHaveLength(1);
		expect(model.savedType).toBe(ImageMimeType.Webp);
		expect(model.fileHandle).toBe(chosen);
	});

	it('rejects without writing when the user declines a question, so the host keeps the file unsaved', async () => {
		const written: Blob[] = [];
		const files = new FileController(model, undefined, platformAnswering(false));
		// JPEG has no transparency, so saving the transparent image asks first.
		await expect(files.saveInto(target('photo.jpg', written))).rejects.toThrow();
		expect(written).toHaveLength(0);
		expect(model.savedType).toBe(ImageMimeType.Png);
	});
});
