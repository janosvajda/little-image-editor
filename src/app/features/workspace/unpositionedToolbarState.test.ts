import { describe, expect, it } from 'vitest';
import { createManagedPanel } from './managedPanel';
import { ManagedToolbarPanel } from './managedToolbarPanel';

describe('unpositioned toolbar state', () => {
	it('does not turn a hidden first-run toolbar coordinate into a saved user position', () => {
		const original = new ManagedToolbarPanel(
			createManagedPanel('original', 'Original').element,
		);
		original.setVisible(false);
		const state = original.snapshot();
		expect(state.positioned).toBe(false);

		const restored = new ManagedToolbarPanel(
			createManagedPanel('restored', 'Restored').element,
		);
		restored.restore(state);
		expect(restored.positioned).toBe(false);
		expect(restored.element.style.left).toBe('');
		expect(restored.element.style.top).toBe('');
	});
});
