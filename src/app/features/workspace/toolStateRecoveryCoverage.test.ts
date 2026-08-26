import { describe, expect, it } from 'vitest';
import { restoreToolState } from './toolStatePersistence';

const STORAGE_KEY = 'littleImageEditor.drawingPreferences';

describe('tool state recovery', () => {
	it('restores legacy strongly typed controls and active tool', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				tool: 'marker',
				color: '#123456',
				size: '24',
				opacity: '40',
				hardness: '70',
				fill: true,
			}),
		);
		const restored = restoreToolState(document);
		expect(restored.activeTool).toBe('marker');
		expect(document.querySelector<HTMLInputElement>('#colorInput')?.value).toBe(
			'#123456',
		);
		expect(document.querySelector<HTMLInputElement>('#fillInput')?.checked).toBe(
			true,
		);
	});

	it('rejects invalid range state without damaging valid controls', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				activeTool: 'brush',
				controls: { sizeInput: 'not-a-number', colorInput: '#abcdef' },
			}),
		);
		const restored = restoreToolState(document);
		expect(restored.restoredControlIds.has('sizeInput')).toBe(false);
		expect(restored.restoredControlIds.has('colorInput')).toBe(true);
	});
});
