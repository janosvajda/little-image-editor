import { describe, expect, it } from 'vitest';
import { ShapeStyle } from '../annotations/shapeStyle';
import { restoreToolState } from './toolStatePersistence';

const STORAGE_KEY = 'littleImageEditor.drawingPreferences';

function restoredStyle(saved: object): string {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
	const restored = restoreToolState(document);
	expect(restored.restoredControlIds.has('shapeStyleInput')).toBe(true);
	return document.querySelector<HTMLInputElement>('#shapeStyleInput')!.value;
}

describe('preferences saved with the Fill checkbox', () => {
	it('keep a checked box as the fill style, from the original record and from saved controls', () => {
		expect(restoredStyle({ tool: 'rectangle', fill: true })).toBe(ShapeStyle.Fill);
		expect(restoredStyle({ activeTool: 'rectangle', controls: { fillInput: false } })).toBe(ShapeStyle.Outline);
		expect(restoredStyle({ activeTool: 'rectangle', controls: { fillInput: true } })).toBe(ShapeStyle.Fill);
	});

	it('leave a chosen style as it is', () => {
		expect(restoredStyle({ activeTool: 'rectangle', controls: { fillInput: true, shapeStyleInput: ShapeStyle.OutlineAndFill } })).toBe(ShapeStyle.OutlineAndFill);
	});
});
