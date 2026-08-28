import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { ImageMimeType } from '../../core/document/appTypes';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
import { NewImageController } from './newImageController';

describe('unified new-image file type', () => {
	it('explains layer preservation for .limg and flattening for raster formats', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		new NewImageController(model);
		const fileType = document.querySelector<HTMLSelectElement>('#newImageFormat')!;
		const warning = document.querySelector<HTMLElement>(
			'#newImageFileTypeWarning',
		)!;

		expect(fileType.value).toBe(PROJECT_MIME_TYPE);
		expect(warning.textContent).toContain('preserves layers');
		fileType.value = ImageMimeType.Png;
		fileType.dispatchEvent(new Event('change', { bubbles: true }));
		expect(warning.textContent).toContain('flattened image');
	});
});
