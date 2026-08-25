import { describe, expect, it } from 'vitest';
import { createManagedPanel } from './managedPanel';
import {
	ManagedToolbarRegistry,
	type ToolbarAvailabilitySource,
} from './managedToolbarPanel';

class DocumentAvailabilityStub implements ToolbarAvailabilitySource {
	hasImage = false;
	#listener: ((snapshot: Readonly<{ hasImage: boolean }>) => void) | undefined;

	onDocumentChange(
		listener: (snapshot: Readonly<{ hasImage: boolean }>) => void,
	): void {
		this.#listener = listener;
		listener({ hasImage: this.hasImage });
	}

	setAvailable(hasImage: boolean): void {
		this.hasImage = hasImage;
		this.#listener?.({ hasImage });
	}
}

describe('managed toolbar document availability', () => {
	it('disables every toolbar body while keeping shared header actions available', () => {
		const root = document.createElement('div');
		const shell = createManagedPanel('sample', 'Sample', {
			defaultVisible: true,
		});
		const editingAction = document.createElement('button');
		editingAction.textContent = 'Edit';
		shell.body.append(editingAction);
		root.append(shell.element);
		const registry = new ManagedToolbarRegistry(root);
		const source = new DocumentAvailabilityStub();
		registry.bindAvailability(source);
		const panel = registry.panels[0]!;

		expect(panel.body.disabled).toBe(true);
		expect(panel.body.getAttribute('aria-disabled')).toBe('true');
		expect(panel.element.classList).toContain('editing-unavailable');
		expect(panel.closeButton.disabled).toBe(false);
		expect(panel.collapseButton.disabled).toBe(false);

		source.setAvailable(true);
		expect(panel.body.disabled).toBe(false);
		expect(panel.body.getAttribute('aria-disabled')).toBe('false');
		expect(panel.element.classList).not.toContain('editing-unavailable');
	});

	it('upgrades static toolbar bodies to the shared native fieldset boundary', () => {
		const root = document.createElement('div');
		root.innerHTML = `
			<section class="panel" data-panel="legacy">
				<header class="panel-header"><span>Legacy</span><button class="collapse"></button></header>
				<div class="panel-body"><input aria-label="Legacy setting"></div>
			</section>`;
		const panel = new ManagedToolbarRegistry(root).panels[0]!;
		expect(panel.body).toBeInstanceOf(HTMLFieldSetElement);
		expect(
			panel.body.querySelector('[aria-label="Legacy setting"]'),
		).not.toBeNull();
	});
});
