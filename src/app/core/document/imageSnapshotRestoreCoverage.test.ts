import { describe, expect, it } from 'vitest';
import { DocumentType } from './appTypes';
import { CanvasDocument } from './imageDocument';

describe('CanvasDocument image snapshot restoration', () => {
	it('restores pixels and document metadata from an isolated snapshot', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'source',
			width: 3,
			height: 2,
			transparent: false,
			background: '#ffffff',
		});
		const snapshot = model.snapshotPixels();

		model.create({
			name: 'replacement',
			width: 1,
			height: 1,
			transparent: true,
			background: '#000000',
		});
		model.restoreSnapshot({ ...snapshot, documentType: DocumentType.Project });

		expect(model.snapshotPixels()).toMatchObject({
			width: 3,
			height: 2,
			baseName: 'source',
		});
		expect(model.documentType).toBe(DocumentType.Project);
	});
});
