import {
	BLEND_MODE_LABELS,
	type BlendMode,
} from '../../core/layers/layerTypes';
import { Numeric } from '../../shared/math/numericConstants';
import { createManagedPanel } from '../workspace/managedPanel';
import { ToolbarDock } from '../workspace/managedToolbarPanel';
import { ToolbarId } from '../workspace/toolbarTypes';

const OPACITY_SLIDER_STEP = 1;

/** Layers toolbar view: active-layer properties, layer actions and the layer stack. */
export class LayersPanel {
	readonly element: HTMLElement;
	readonly list = document.createElement('div');
	readonly newPaintLayerButton = document.createElement('button');
	readonly duplicateLayerButton = document.createElement('button');
	readonly mergeDownButton = document.createElement('button');
	readonly properties = document.createElement('fieldset');
	readonly nameInput = document.createElement('input');
	readonly blendModeSelect = document.createElement('select');
	readonly opacityInput = document.createElement('input');
	readonly opacityOutput = document.createElement('output');

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
		panel.body.append(
			this.createProperties(),
			this.createActions(),
			orderHint,
			this.list,
		);
	}

	private createProperties(): HTMLFieldSetElement {
		this.properties.className = 'layer-properties';
		const legend = document.createElement('legend');
		legend.textContent = 'Active layer';
		// Layer properties belong to the document's layers, not to toolbar
		// preferences, so these controls deliberately have no persisted id.
		this.nameInput.className = 'layer-name-input';
		this.nameInput.type = 'text';
		this.nameInput.autocomplete = 'off';
		this.nameInput.spellcheck = false;
		this.blendModeSelect.className = 'layer-blend-mode';
		for (const [mode, label] of Object.entries(BLEND_MODE_LABELS) as Array<
			[BlendMode, string]
		>)
			this.blendModeSelect.append(new Option(label, mode));
		this.opacityInput.className = 'layer-opacity';
		this.opacityInput.type = 'range';
		this.opacityInput.min = '0';
		this.opacityInput.max = String(Numeric.PercentScale);
		this.opacityInput.step = String(OPACITY_SLIDER_STEP);
		this.opacityOutput.className = 'layer-opacity-value';
		const opacity = labelled('Opacity', this.opacityInput);
		opacity.append(this.opacityOutput);
		this.properties.append(
			legend,
			labelled('Name', this.nameInput),
			labelled('Blend', this.blendModeSelect),
			opacity,
		);
		return this.properties;
	}

	private createActions(): HTMLElement {
		const actions = document.createElement('div');
		actions.className = 'layer-actions';
		this.newPaintLayerButton.type = 'button';
		this.newPaintLayerButton.className = 'icon-text-button layer-new-paint';
		this.newPaintLayerButton.textContent = '+ New paint layer';
		this.newPaintLayerButton.title = 'Create a new paint layer';
		this.duplicateLayerButton.type = 'button';
		this.duplicateLayerButton.className = 'icon-text-button layer-duplicate';
		this.duplicateLayerButton.textContent = 'Duplicate';
		this.duplicateLayerButton.title = 'Duplicate the active layer';
		this.mergeDownButton.type = 'button';
		this.mergeDownButton.className = 'icon-text-button layer-merge-down';
		this.mergeDownButton.textContent = 'Merge down';
		this.mergeDownButton.title = 'Merge the active layer into the layer beneath it';
		actions.append(
			this.newPaintLayerButton,
			this.duplicateLayerButton,
			this.mergeDownButton,
		);
		return actions;
	}
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
	const label = document.createElement('label');
	label.className = 'layer-property';
	const caption = document.createElement('span');
	caption.textContent = text;
	label.append(caption, control);
	return label;
}
