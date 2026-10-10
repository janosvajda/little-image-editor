import { describe, expect, it } from 'vitest';
import { ownedFileBytes, receivedFileBytes } from './vscodeMessages';

const FILE = [137, 80, 78, 71] as const;
const PADDING = 3;

describe('file bytes between VS Code and the editor', () => {
	it('sends only the file when VS Code reads it into part of a larger buffer', () => {
		const shared = new Uint8Array(PADDING + FILE.length + PADDING);
		shared.set(FILE, PADDING);
		const view = shared.subarray(PADDING, PADDING + FILE.length);
		const sent = ownedFileBytes(view);
		expect(sent.byteOffset).toBe(0);
		expect(sent.buffer.byteLength).toBe(FILE.length);
		expect([...sent]).toEqual(FILE);
	});

	it('accepts the bytes however the channel delivers them', () => {
		const bytes = Uint8Array.from(FILE);
		for (const delivered of [bytes, bytes.buffer, [...FILE], { ...bytes }])
			expect([...receivedFileBytes(delivered)]).toEqual(FILE);
		expect(receivedFileBytes(undefined)).toHaveLength(0);
	});
});
