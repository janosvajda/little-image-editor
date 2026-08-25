import { describe, expect, it } from 'vitest';
import { createManagedPanel } from './managedPanel';
import { ManagedToolbarRegistry, ToolbarDock } from './managedToolbarPanel';
import { ToolbarLayoutCoordinator } from './toolbarLayoutCoordinator';
import {
	type ToolbarLayoutBounds,
	ToolbarLayoutEngine,
	type ToolbarRectangle,
} from './toolbarLayoutEngine';

const MARGIN = 10;
const GAP = 8;
const BOTTOM_INSET = 20;
const WORKSPACE_WIDTH = 600;
const WORKSPACE_HEIGHT = 500;
const PANEL_WIDTH = 120;
const PANEL_HEIGHT = 100;
const engine = new ToolbarLayoutEngine({ margin: MARGIN, gap: GAP });
const bounds: ToolbarLayoutBounds = {
	width: WORKSPACE_WIDTH,
	height: WORKSPACE_HEIGHT,
	bottomInset: BOTTOM_INSET,
};

function rectangle(
	x: number,
	y: number,
	width = PANEL_WIDTH,
	height = PANEL_HEIGHT,
): ToolbarRectangle {
	return { x, y, width, height };
}

describe('ToolbarLayoutEngine', () => {
	it('clamps panels inside the complete usable workspace', () => {
		expect(
			engine.clamp(
				{ x: WORKSPACE_WIDTH, y: WORKSPACE_HEIGHT },
				{ width: PANEL_WIDTH, height: PANEL_HEIGHT },
				bounds,
			),
		).toEqual({
			x: WORKSPACE_WIDTH - PANEL_WIDTH,
			y: WORKSPACE_HEIGHT - PANEL_HEIGHT - BOTTOM_INSET,
		});
		expect(
			engine.clamp(
				{ x: -GAP, y: -GAP },
				{ width: PANEL_WIDTH, height: PANEL_HEIGHT },
				bounds,
			),
		).toEqual({ x: 0, y: 0 });
	});

	it('finds deterministic non-overlapping dock positions on either side', () => {
		const leftObstacle = rectangle(MARGIN, MARGIN);
		const rightObstacle = rectangle(
			WORKSPACE_WIDTH - PANEL_WIDTH - MARGIN,
			MARGIN,
		);

		expect(
			engine.findDockPosition(
				{ width: PANEL_WIDTH, height: PANEL_HEIGHT },
				ToolbarDock.Left,
				[leftObstacle],
				bounds,
			),
		).toEqual({ x: MARGIN, y: MARGIN + PANEL_HEIGHT + GAP });
		expect(
			engine.findDockPosition(
				{ width: PANEL_WIDTH, height: PANEL_HEIGHT },
				ToolbarDock.Right,
				[rightObstacle],
				bounds,
			),
		).toEqual({
			x: WORKSPACE_WIDTH - PANEL_WIDTH - MARGIN,
			y: MARGIN + PANEL_HEIGHT + GAP,
		});
	});

	it('keeps a free requested position and resolves a collision to its nearest opening', () => {
		const obstacle = rectangle(100, 100);
		expect(
			engine.resolveNearest(
				{ x: 300, y: 200 },
				{ width: PANEL_WIDTH, height: PANEL_HEIGHT },
				[obstacle],
				bounds,
			),
		).toEqual({ x: 300, y: 200 });
		expect(
			engine.resolveNearest(
				{ x: 110, y: 110 },
				{ width: PANEL_WIDTH, height: PANEL_HEIGHT },
				[obstacle],
				bounds,
			),
		).toEqual({ x: 110, y: 208 });
	});

	it('uses dock search when every adjacent candidate is occupied', () => {
		const requested = { x: 100, y: 100 };
		const blockers = [
			rectangle(100, 100),
			rectangle(0, 100),
			rectangle(228, 100),
			rectangle(100, 0),
			rectangle(100, 208),
		];
		const result = engine.resolveNearest(
			requested,
			{ width: PANEL_WIDTH, height: PANEL_HEIGHT },
			blockers,
			bounds,
		);
		expect(
			blockers.every(
				(blocker) =>
					!engine.overlaps(
						{ ...result, width: PANEL_WIDTH, height: PANEL_HEIGHT },
						blocker,
					),
			),
		).toBe(true);
	});
});

describe('ToolbarLayoutCoordinator', () => {
	it('applies the same collision-free lifecycle to every managed toolbar', () => {
		const root = document.createElement('div');
		const primary = createManagedPanel('primary', 'Primary', {
			defaultVisible: true,
			defaultDock: ToolbarDock.Left,
		});
		const secondary = createManagedPanel('secondary', 'Secondary', {
			defaultVisible: true,
			defaultDock: ToolbarDock.Left,
		});
		root.append(primary.element, secondary.element);
		const registry = new ManagedToolbarRegistry(root);
		for (const panel of registry.panels) {
			Object.defineProperties(panel.element, {
				offsetParent: { configurable: true, value: root },
				offsetWidth: { configurable: true, value: PANEL_WIDTH },
				offsetHeight: { configurable: true, value: PANEL_HEIGHT },
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
		let suspended = false;
		const coordinator = new ToolbarLayoutCoordinator(registry.panels, engine, {
			getBounds: () => bounds,
			isLayoutSuspended: () => suspended,
		});
		const [first, second] = registry.panels;

		coordinator.arrangeDefault();
		expect(first!.position).toEqual({ x: MARGIN, y: MARGIN });
		expect(second!.position).toEqual({
			x: MARGIN,
			y: MARGIN + PANEL_HEIGHT + GAP,
		});

		coordinator.constrain(second!, WORKSPACE_WIDTH, WORKSPACE_HEIGHT);
		expect(second!.position).toEqual({
			x: WORKSPACE_WIDTH - PANEL_WIDTH,
			y: WORKSPACE_HEIGHT - PANEL_HEIGHT - BOTTOM_INSET,
		});

		second!.setPosition(first!.position);
		coordinator.resolveAll();
		expect(
			engine.overlaps(
				{ ...first!.position, ...first!.size },
				{ ...second!.position, ...second!.size },
			),
		).toBe(false);

		second!.element.style.removeProperty('left');
		second!.element.style.removeProperty('top');
		coordinator.placeNew(second!);
		expect(second!.position).toEqual({
			x: MARGIN,
			y: MARGIN + PANEL_HEIGHT + GAP,
		});

		suspended = true;
		const unchanged = second!.position;
		coordinator.constrain(second!, 0, 0);
		coordinator.resolve(second!);
		coordinator.resolveAll();
		expect(second!.position).toEqual(unchanged);
	});
});
