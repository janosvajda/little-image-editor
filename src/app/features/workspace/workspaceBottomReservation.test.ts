import { describe, expect, it } from 'vitest';
import { WorkspaceUi } from './workspaceController';

const BOTTOM_INSET_PROPERTY = '--toolbar-workspace-bottom-inset';
const STATUS_BAR_HEIGHT = 28;
const TIMELINE_HEIGHT = 196;

describe('room reserved along the bottom of the workspace', () => {
	it('keeps floating toolbars above a docked strip as well as the status bar, and gives the room back', () => {
		const ui = new WorkspaceUi([]);
		const inset = () => ui.workspace.style.getPropertyValue(BOTTOM_INSET_PROPERTY);
		expect(inset()).toBe(`${STATUS_BAR_HEIGHT}px`);
		ui.reserveBottom(TIMELINE_HEIGHT);
		expect(inset()).toBe(`${STATUS_BAR_HEIGHT + TIMELINE_HEIGHT}px`);
		ui.reserveBottom(TIMELINE_HEIGHT);
		expect(inset()).toBe(`${STATUS_BAR_HEIGHT + TIMELINE_HEIGHT}px`);
		ui.reserveBottom(-1);
		expect(inset()).toBe(`${STATUS_BAR_HEIGHT}px`);
	});
});
