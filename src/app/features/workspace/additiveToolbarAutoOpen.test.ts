import { describe, expect, it } from 'vitest';
import { AnnotationPanel } from '../annotations/annotationPanel';
import { type KeyValueStorage, ToolbarLayoutStore } from './toolbarLayoutStore';
import { ToolbarAutoOpenMode, ToolbarId } from './toolbarTypes';
import { WorkspaceUi } from './workspaceController';

class MemoryStorage implements KeyValueStorage {
	readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

describe('additive toolbar auto-open', () => {
	it('opens the requested toolbar without changing other toolbar visibility', () => {
		const annotationPanel = new AnnotationPanel();
		document
			.querySelector('[data-panel="transform"]')!
			.before(annotationPanel.element);
		const ui = new WorkspaceUi([], new ToolbarLayoutStore(new MemoryStorage()));
		const visibilityBefore = new Map(
			ui.toolbarPanels
				.filter((panel) => panel.key !== ToolbarId.Annotations)
				.map((panel) => [panel.key, panel.visible]),
		);

		expect(ui.autoOpenToolbar(ToolbarAutoOpenMode.Annotate)).toBe(true);

		expect(annotationPanel.element.hidden).toBe(false);
		for (const [key, visible] of visibilityBefore)
			expect(ui.toolbarRegistry.get(key)?.visible).toBe(visible);
	});
});
