import { createManagedPanel } from '../workspace/managedPanel';
import { ToolbarDock } from '../workspace/managedToolbarPanel';
import { ToolbarId } from '../workspace/toolbarTypes';

export class LayersPanel {
	readonly element: HTMLElement;
	readonly list = document.createElement('div');

	constructor() {
		const panel = createManagedPanel(ToolbarId.Layers, 'Layers', {
			className: 'layers-panel',
			defaultDock: ToolbarDock.Right,
		});
		this.element = panel.element;
		this.list.className = 'layer-list';
		this.list.setAttribute('role', 'listbox');
		this.list.setAttribute('aria-label', 'Image layers');
		panel.body.append(this.list);
	}
}
