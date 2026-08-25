import { describe, expect, it } from 'vitest';
import { ToolbarDock } from './managedToolbarPanel';
import { ToolbarLayoutEngine } from './toolbarLayoutEngine';

const MARGIN = 14;
const GAP = 14;

describe('oversized toolbar placement', () => {
	it('keeps a viewport-height toolbar in its requested dock column', () => {
		const engine = new ToolbarLayoutEngine({ margin: MARGIN, gap: GAP });
		const position = engine.findDockPosition(
			{ width: 320, height: 700 },
			ToolbarDock.Left,
			[],
			{ width: 1_200, height: 680, bottomInset: 28 },
		);
		expect(position.x).toBe(MARGIN);
		expect(position.y).toBe(0);
	});
});
