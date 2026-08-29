import { createManagedPanel } from '../workspace/managedPanel';
import { ToolbarDock } from '../workspace/managedToolbarPanel';
import { ToolbarId } from '../workspace/toolbarTypes';

export class LayersPanel {
	readonly element: HTMLElement;
	readonly list = document.createElement('div');
	readonly newPaintLayerButton = document.createElement('button');

	constructor() {
		const panel = createManagedPanel(ToolbarId.Layers, 'Layers', {
			className: 'layers-panel',
			defaultDock: ToolbarDock.Right,
		});
		this.element = panel.element;
		this.list.className = 'layer-list';
		this.list.setAttribute('role', 'listbox');
		this.list.setAttribute('aria-label', 'Image layers');
		const orderHint = document.createElement('p');
		orderHint.className = 'layer-order-hint';
		orderHint.textContent = 'Top objects render in front.';
		this.newPaintLayerButton.type = 'button';
		this.newPaintLayerButton.className = 'icon-text-button layer-new-paint';
		this.newPaintLayerButton.textContent = '+ New paint layer';
		this.newPaintLayerButton.title = 'Create a new paint layer';
		panel.body.append(orderHint, this.newPaintLayerButton, this.list);
	}
}
