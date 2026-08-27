import { describe, expect, it } from 'vitest';
import { ManagedToolbarPanel } from './managedToolbarPanel';

describe('managed toolbar scrolling geometry', () => {
	it('publishes its resolved top position for the generic viewport height limit', () => {
		const root = document.createElement('section');
		root.className = 'panel';
		root.dataset.panel = 'scroll-contract';
		root.innerHTML =
			'<header class="panel-header"><span>Scrollable</span><button class="collapse"></button></header><div class="panel-body"></div>';
		const panel = new ManagedToolbarPanel(root);

		panel.setResolvedPosition({ x: 40, y: 125 });

		expect(root.dataset.toolbarPanel).toBe('managed');
		expect(root.style.getPropertyValue('--toolbar-panel-top')).toBe('125px');
	});
});
