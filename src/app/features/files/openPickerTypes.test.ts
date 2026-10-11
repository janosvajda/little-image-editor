import { describe, expect, it } from 'vitest';
import { IMAGE_FORMATS } from '../../core/document/imageFormats';
import { PROJECT_EXTENSION, PROJECT_MIME_TYPE } from '../projects/projectTypes';
import { EDITOR_OPEN_PICKER_TYPES, PROJECT_PICKER_TYPE } from './openFileTypes';

describe('the Open file picker', () => {
	it('first shows images and projects together, so a .limg project can be chosen without switching the file type', () => {
		const [first] = EDITOR_OPEN_PICKER_TYPES;
		expect(first!.accept[PROJECT_MIME_TYPE]).toEqual([`.${PROJECT_EXTENSION}`]);
		for (const { mimeType, extensions } of IMAGE_FORMATS) expect(first!.accept[mimeType]).toEqual(extensions.map((extension) => `.${extension}`));
	});

	it('then offers images alone and projects alone, to filter by', () => {
		const [, images, projects] = EDITOR_OPEN_PICKER_TYPES;
		expect(images!.accept).not.toHaveProperty(PROJECT_MIME_TYPE);
		expect(Object.keys(images!.accept)).toEqual([...IMAGE_FORMATS.map(({ mimeType }) => mimeType), 'image/svg+xml']);
		expect(projects).toBe(PROJECT_PICKER_TYPE);
	});
});
