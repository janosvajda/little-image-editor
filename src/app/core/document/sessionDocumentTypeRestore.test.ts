import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionPersistence } from '../../features/files/sessionPersistence';
import { DocumentType } from './appTypes';
import { CanvasDocument } from './imageDocument';

const DocumentSize = { Width: 6, Height: 4 } as const;

function canvasDocument(): CanvasDocument {
	return new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
}

function createDocument(model: CanvasDocument, documentType: DocumentType): void {
	model.create({
		name: 'layered',
		width: DocumentSize.Width,
		height: DocumentSize.Height,
		transparent: true,
		background: '#ffffff',
		documentType,
	});
}

describe('session document type restore', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'indexedDB', {
			configurable: true,
			value: new IDBFactory(),
		});
	});

	it.each([DocumentType.Project, DocumentType.Image])(
		'restores a %s session snapshot with its document type',
		(documentType) => {
			const source = canvasDocument();
			createDocument(source, documentType);
			const restored = canvasDocument();
			restored.restoreSession(source.snapshotSession());
			expect(restored.documentType).toBe(documentType);
		},
	);

	it('defaults legacy sessions without a document type to a flat image', () => {
		const source = canvasDocument();
		createDocument(source, DocumentType.Project);
		const { documentType: _omitted, ...legacy } = source.snapshotSession();
		const restored = canvasDocument();
		restored.documentType = DocumentType.Project;
		restored.restoreSession(legacy);
		expect(restored.documentType).toBe(DocumentType.Image);
	});

	it('keeps a layered project a project after a browser recovery', async () => {
		const source = canvasDocument();
		new SessionPersistence(source);
		createDocument(source, DocumentType.Project);
		const restored = canvasDocument();
		await expect
			.poll(() => new SessionPersistence(restored).restore())
			.toBe(true);
		expect(restored.documentType).toBe(DocumentType.Project);
	});
});
