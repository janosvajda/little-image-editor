import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';
import type { AnnotationObject } from '../annotations/annotationTypes';
import { type EffectProperty, EffectPropertyId, type EffectPropertyValues, editableEffects, setEffectProperty } from '../annotations/editableEffects';
import { EffectRange } from '../annotations/itemEffects';
import type { LiveItemEdit } from './liveItemEdit';
import type { SelectedObjectSection } from './selectedObjectSection';

/** What each effect control says beside it. */
const EFFECT_LABELS: Readonly<Record<EffectProperty, string>> = {
	[EffectPropertyId.Blur]: 'Blur',
	[EffectPropertyId.Shadow]: 'Shadow',
	[EffectPropertyId.ShadowColor]: '',
	[EffectPropertyId.ShadowDistance]: 'Distance',
	[EffectPropertyId.ShadowSoftness]: 'Softness',
};
/** How assistive technology names each effect control. */
const EFFECT_ACCESSIBLE_NAMES: Readonly<Record<EffectProperty, string>> = {
	[EffectPropertyId.Blur]: 'blur',
	[EffectPropertyId.Shadow]: 'shadow',
	[EffectPropertyId.ShadowColor]: 'shadow colour',
	[EffectPropertyId.ShadowDistance]: 'shadow distance',
	[EffectPropertyId.ShadowSoftness]: 'shadow softness',
};
const EFFECTS_LABEL = 'Effects';
const PIXEL_UNIT = 'px';

type RangeEffect = typeof EffectPropertyId.Blur | typeof EffectPropertyId.ShadowDistance | typeof EffectPropertyId.ShadowSoftness;
const EFFECT_RANGES: Readonly<Record<RangeEffect, Readonly<{ Minimum: number; Maximum: number }>>> = {
	[EffectPropertyId.Blur]: EffectRange.Blur,
	[EffectPropertyId.ShadowDistance]: EffectRange.ShadowDistance,
	[EffectPropertyId.ShadowSoftness]: EffectRange.ShadowSoftness,
};

interface EffectControl {
	readonly row: HTMLElement;
	readonly input: HTMLInputElement;
	readonly output?: HTMLOutputElement;
}

/**
 * The selected item's effects, behind one Effects button so the bar stays
 * short: a blur, and a shadow with its colour, distance and softness.
 */
export class SelectedObjectEffects implements SelectedObjectSection {
	readonly element = document.createElement('details');
	readonly #summary = document.createElement('summary');
	readonly #controls: Readonly<Record<EffectProperty, EffectControl>>;

	constructor(private readonly edit: LiveItemEdit) {
		this.element.className = 'object-effects';
		this.#summary.className = 'object-effects-button';
		this.#summary.title = EFFECTS_LABEL;
		this.#summary.setAttribute('aria-label', `Selected object ${EFFECTS_LABEL.toLowerCase()}`);
		this.#summary.innerHTML = `${editorIconMarkup(EditorIconId.Effects)}<span>${EFFECTS_LABEL}</span>`;
		const panel = document.createElement('div');
		panel.className = 'object-effects-panel';
		this.#controls = {
			[EffectPropertyId.Blur]: this.rangeControl(EffectPropertyId.Blur),
			[EffectPropertyId.Shadow]: this.checkboxControl(),
			[EffectPropertyId.ShadowColor]: this.colorControl(),
			[EffectPropertyId.ShadowDistance]: this.rangeControl(EffectPropertyId.ShadowDistance),
			[EffectPropertyId.ShadowSoftness]: this.rangeControl(EffectPropertyId.ShadowSoftness),
		};
		// The shadow's colour sits beside the checkbox that turns the shadow on.
		const shadowGroup = document.createElement('div');
		shadowGroup.className = 'shadow-group';
		shadowGroup.append(this.#controls[EffectPropertyId.Shadow].row, this.#controls[EffectPropertyId.ShadowColor].row);
		panel.append(this.#controls[EffectPropertyId.Blur].row, shadowGroup, this.#controls[EffectPropertyId.ShadowDistance].row, this.#controls[EffectPropertyId.ShadowSoftness].row);
		this.element.append(this.#summary, panel);
		// Where the panel floats over the picture, it opens under its button, kept on screen; it is placed as it opens, so it is never seen elsewhere.
		this.#summary.addEventListener('click', (event) => {
			event.preventDefault();
			this.element.open = !this.element.open;
			if (this.element.open) placeBelow(panel, this.#summary);
		});
		// A press anywhere else puts the panel away, as a menu is.
		document.addEventListener('pointerdown', (event) => {
			if (this.element.open && !this.element.contains(event.target as Node)) this.element.open = false;
		});
	}

	show(item: Readonly<AnnotationObject>): boolean {
		const values = editableEffects(item);
		if (!values) {
			this.element.open = false;
			return false;
		}
		this.#summary.classList.toggle('active', values.blur > 0 || values.shadow);
		for (const [property, control] of Object.entries(this.#controls) as Array<[EffectProperty, EffectControl]>) this.showValue(control, values[property]);
		return true;
	}

	private showValue(control: EffectControl, value: EffectPropertyValues[EffectProperty]): void {
		control.row.classList.toggle('hidden', value === undefined);
		if (value === undefined) return;
		if (typeof value === 'boolean') control.input.checked = value;
		else control.input.value = String(typeof value === 'number' ? Math.round(value) : value);
		if (control.output && typeof value === 'number') control.output.value = `${Math.round(value)} ${PIXEL_UNIT}`;
	}

	private rangeControl(property: RangeEffect): EffectControl {
		const { row, input } = this.labelledControl(property, 'range');
		const range = EFFECT_RANGES[property];
		input.min = String(range.Minimum);
		input.max = String(range.Maximum);
		const output = document.createElement('output');
		row.insertBefore(output, input);
		this.bind(input, property, () => Number(input.value), (value) => {
			output.value = `${Math.round(value)} ${PIXEL_UNIT}`;
		});
		return { row, input, output };
	}

	private checkboxControl(): EffectControl {
		const control = this.labelledControl(EffectPropertyId.Shadow, 'checkbox');
		control.row.classList.add('check');
		this.bind(control.input, EffectPropertyId.Shadow, () => control.input.checked);
		return control;
	}

	private colorControl(): EffectControl {
		const input = document.createElement('input');
		input.type = 'color';
		input.setAttribute('aria-label', `Selected object ${EFFECT_ACCESSIBLE_NAMES[EffectPropertyId.ShadowColor]}`);
		const row = document.createElement('span');
		row.dataset.effectProperty = EffectPropertyId.ShadowColor;
		row.append(input);
		this.bind(input, EffectPropertyId.ShadowColor, () => input.value);
		return { row, input };
	}

	private labelledControl(property: EffectProperty, type: HTMLInputElement['type']): EffectControl {
		const row = document.createElement('label');
		row.dataset.effectProperty = property;
		row.append(EFFECT_LABELS[property]);
		const input = document.createElement('input');
		input.type = type;
		input.setAttribute('aria-label', `Selected object ${EFFECT_ACCESSIBLE_NAMES[property]}`);
		row.append(input);
		return { row, input };
	}

	private bind<Value extends string | number | boolean>(input: HTMLInputElement, property: EffectProperty, read: () => Value, edited?: (value: Value) => void): void {
		this.edit.bind(input, property, read, (item, value) => setEffectProperty(item, property, value), edited);
	}
}

/** The gap between a button and the panel it opens, and between the panel and the window's edge. */
const PANEL_GAP = 6;

/** Places a floating panel under its button, inside the window; a panel in the page's flow ignores it. */
function placeBelow(panel: HTMLElement, button: HTMLElement): void {
	const { left, bottom } = button.getBoundingClientRect();
	panel.style.top = `${bottom + PANEL_GAP}px`;
	panel.style.left = `${Math.max(PANEL_GAP, Math.min(left, window.innerWidth - panel.offsetWidth - PANEL_GAP))}px`;
}
