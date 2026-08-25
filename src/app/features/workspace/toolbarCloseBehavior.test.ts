import { describe, expect, it, vi } from 'vitest';
import { createManagedPanel } from './managedPanel';
import { ManagedToolbarRegistry } from './managedToolbarPanel';

describe('managed toolbar close behavior', () => {
	it('gives every toolbar the same accessible close request control', () => {
		const root = document.createElement('div');
		root.append(
			createManagedPanel('primary', 'Primary', { defaultVisible: true })
				.element,
			createManagedPanel('secondary', 'Secondary', {
				defaultVisible: true,
			}).element,
		);
		const registry = new ManagedToolbarRegistry(root);

		for (const panel of registry.panels) {
			const closeRequest = vi.fn();
			panel.onCloseRequest(closeRequest);
			expect(panel.closeButton.type).toBe('button');
			expect(panel.closeButton.getAttribute('aria-label')).toBe(
				`Close ${panel.title}`,
			);
			expect(panel.header.lastElementChild).toBe(panel.closeButton);
			panel.closeButton.click();
			expect(closeRequest).toHaveBeenCalledOnce();
		}
	});
});
