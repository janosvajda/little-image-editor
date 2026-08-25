import { describe, expect, it } from 'vitest';
import { createManagedPanel } from './managedPanel';
import { ManagedToolbarPanel } from './managedToolbarPanel';

const SAVED_POSITION = { x: 320, y: 180 } as const;

describe('hidden toolbar position persistence', () => {
	it('retains the last visible position while hidden and restores it generically', () => {
		const shell = createManagedPanel('sample', 'Sample', {
			defaultVisible: true,
		});
		const panel = new ManagedToolbarPanel(shell.element);
		panel.setPosition(SAVED_POSITION);
		panel.setVisible(false);

		expect(panel.snapshot()).toMatchObject({
			...SAVED_POSITION,
			visible: false,
		});

		panel.setVisible(true);
		expect(panel.position).toEqual(SAVED_POSITION);
		expect(panel.element.style.left).toBe(`${SAVED_POSITION.x}px`);
		expect(panel.element.style.top).toBe(`${SAVED_POSITION.y}px`);
	});

	it('applies a persisted position before restoring visibility', () => {
		const shell = createManagedPanel('restored', 'Restored');
		const panel = new ManagedToolbarPanel(shell.element);
		panel.restore({
			...SAVED_POSITION,
			collapsed: true,
			visible: false,
		});

		expect(panel.position).toEqual(SAVED_POSITION);
		expect(panel.collapsed).toBe(true);
		expect(panel.visible).toBe(false);
	});
});
