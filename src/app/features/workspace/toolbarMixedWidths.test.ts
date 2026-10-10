import { describe, expect, it } from 'vitest';
import { ToolbarDock } from './managedToolbarPanel';
import { ToolbarLayoutEngine } from './toolbarLayoutEngine';

const Spacing = { margin: 14, gap: 14 } as const;
const Bounds = { width: 1600, height: 1000, bottomInset: 28 } as const;
const Narrow = { width: 260, height: 600 } as const;
const Wide = { width: 460, height: 900 } as const;

describe('mixed-width toolbar docking', () => {
	it('starts a wider left column immediately after the occupied column', () => {
		const engine = new ToolbarLayoutEngine(Spacing);
		const obstacle = { x: Spacing.margin, y: Spacing.margin, ...Narrow };
		const position = engine.findDockPosition(Wide, ToolbarDock.Left, [obstacle], Bounds);
		expect(position).toEqual({ x: obstacle.x + obstacle.width + Spacing.gap, y: Spacing.margin });
		expect(engine.overlaps({ ...position, ...Wide }, obstacle)).toBe(false);
	});

	it('starts a wider right column immediately before the occupied column', () => {
		const engine = new ToolbarLayoutEngine(Spacing);
		const obstacle = { x: Bounds.width - Narrow.width - Spacing.margin, y: Spacing.margin, ...Narrow };
		const position = engine.findDockPosition(Wide, ToolbarDock.Right, [obstacle], Bounds);
		expect(position).toEqual({ x: obstacle.x - Wide.width - Spacing.gap, y: Spacing.margin });
		expect(engine.overlaps({ ...position, ...Wide }, obstacle)).toBe(false);
	});
});
