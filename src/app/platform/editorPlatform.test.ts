import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageMimeType } from '../core/document/appTypes';
import { CanvasDocument } from '../core/document/imageDocument';
import { ClipboardController } from '../features/files/clipboardController';
import { FileController } from '../features/files/fileController';
import { ToolbarLayoutStore } from '../features/workspace/toolbarLayoutStore';
import { createBrowserPlatform } from './browserPlatform';
import {
	type EditorPlatform,
	editorPlatform,
	installEditorPlatform,
	type KeyValueStorage,
	type SaveTarget,
} from './editorPlatform';

const Surface = { width: 20, height: 10 } as const;

/** A shell that writes to a file it was given and keeps preferences in memory, as VS Code will. */
function hostPlatform(target: SaveTarget): EditorPlatform & {
	readonly written: Blob[];
	readonly copied: string[];
} {
	const written: Blob[] = [];
	const copied: string[] = [];
	const values = new Map<string, string>();
	const storage: KeyValueStorage = {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key),
	};
	return {
		written,
		copied,
		files: {
			canPickSaveTarget: () => true,
			pickSaveTarget: async () => target,
			canPickOpenTarget: () => false,
			pickOpenTargets: async () => [],
			download: (contents) => void written.push(contents),
		},
		clipboard: {
			writeImage: async () => undefined,
			writeText: async (text) => void copied.push(text),
		},
		storage,
	};
}

function hostTarget(written: Blob[]): SaveTarget {
	return {
		name: 'diagram.png',
		createWritable: async () => ({
			write: async (contents) => void written.push(contents),
			close: async () => undefined,
		}),
	};
}

afterEach(() => installEditorPlatform(createBrowserPlatform()));

describe('editor platform', () => {
	it('uses the web page platform until a shell installs its own', () => {
		expect(editorPlatform().storage).toBe(localStorage);
		const written: Blob[] = [];
		const host = hostPlatform(hostTarget(written));
		installEditorPlatform(host);
		expect(editorPlatform()).toBe(host);
	});

	it('saves, copies and stores preferences through the installed platform', async () => {
		const written: Blob[] = [];
		const host = hostPlatform(hostTarget(written));
		installEditorPlatform(host);
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({ name: 'diagram', ...Surface, transparent: false, background: '#ffffff' });
		vi.spyOn(model, 'toBlob').mockResolvedValue(new Blob(['png'], { type: ImageMimeType.Png }));

		const files = new FileController(model);
		await files.saveAs();
		expect(written).toHaveLength(1);
		expect(model.fileHandle?.name).toBe('diagram.png');
		await files.save();
		expect(written).toHaveLength(2);

		await new ClipboardController(model).copyText('report');
		expect(host.copied).toEqual(['report']);

		new ToolbarLayoutStore().save({});
		expect(host.storage.getItem('little-editor.panel-layout.v2')).toBe('{}');
	});
});
