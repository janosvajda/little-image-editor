import { describe, expect, it } from 'vitest';
import { createManagedPanel } from './managedPanel';
import { ManagedToolbarRegistry, ToolbarDock } from './managedToolbarPanel';
import { ToolbarLayoutCoordinator } from './toolbarLayoutCoordinator';
import { ToolbarLayoutEngine } from './toolbarLayoutEngine';

const PREFERRED_POSITION = { x: 20, y: 20 } as const;
const PANEL_SIZE = { width: 120, height: 100 } as const;
const WORKSPACE_BOUNDS = { width: 600, height: 500, bottomInset: 20 } as const;
const COLLISION_GAP = 8;

describe('preferred toolbar position', () => {
	it('keeps the user position while resolving only the newly shown toolbar', () => {
		const root = document.createElement('div');
		const existing = createManagedPanel('existing', 'Existing', {
			defaultVisible: true,
		});
		const opening = createManagedPanel('opening', 'Opening', {
			defaultDock: ToolbarDock.Left,
		});
		root.append(existing.element, opening.element);
		const registry = new ManagedToolbarRegistry(root);
		for (const panel of registry.panels) {
			Object.defineProperties(panel.element, {
				offsetParent: { configurable: true, value: root },
				offsetWidth: { configurable: true, value: PANEL_SIZE.width },
				offsetHeight: { configurable: true, value: PANEL_SIZE.height },
				offsetLeft: {
					configurable: true,
					get: () => Number.parseInt(panel.element.style.left) || 0,
				},
				offsetTop: {
					configurable: true,
					get: () => Number.parseInt(panel.element.style.top) || 0,
				},
			});
		}
		const [existingPanel, openingPanel] = registry.panels;
		existingPanel!.setPosition(PREFERRED_POSITION);
		openingPanel!.setPosition(PREFERRED_POSITION);
		openingPanel!.setVisible(true);
		const coordinator = new ToolbarLayoutCoordinator(
			registry.panels,
			new ToolbarLayoutEngine({ margin: 10, gap: COLLISION_GAP }),
			{
				getBounds: () => WORKSPACE_BOUNDS,
				isLayoutSuspended: () => false,
			},
		);

		coordinator.placeNew(openingPanel!, true);

		expect(existingPanel!.position).toEqual(PREFERRED_POSITION);
		expect(openingPanel!.position).not.toEqual(PREFERRED_POSITION);
		expect(openingPanel!.snapshot()).toMatchObject(PREFERRED_POSITION);
	});
});
