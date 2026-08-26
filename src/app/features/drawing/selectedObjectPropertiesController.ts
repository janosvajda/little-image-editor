import { element } from '../../shared/dom/domHelpers';
import {
	AnnotationChangeKind,
	type AnnotationDocument,
} from '../annotations/annotationDocument';
import {
	EditableObjectPropertyId,
	editableObjectProperties,
	setEditableObjectProperty,
	type EditableObjectProperty,
} from '../annotations/editableObjectProperties';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';

const Percentage = {
	Scale: 100,
	Minimum: 1,
	Maximum: 100,
} as const;
const ObjectSize = { Minimum: 1, Maximum: 200 } as const;

interface PropertyControl {
	readonly row: HTMLLabelElement;
	readonly input: HTMLInputElement;
	readonly output?: HTMLOutputElement;
}

export class SelectedObjectPropertiesController {
	readonly #root = document.createElement('section');
	readonly #controls: Readonly<Record<EditableObjectProperty, PropertyControl>>;
	readonly #dirtyProperties = new Set<EditableObjectProperty>();
	#synchronizing = false;

	constructor(
		private readonly objects: AnnotationDocument,
		private readonly parent: HTMLElement,
		private readonly continueStroke: () => void = () => undefined,
	) {
		this.#root.className = 'selected-object-options hidden';
		this.#root.setAttribute('aria-label', 'Selected object properties');
		this.#root.append(this.heading());
		this.#controls = {
			[EditableObjectPropertyId.Color]: this.colorControl(),
			[EditableObjectPropertyId.Size]: this.rangeControl(
				EditableObjectPropertyId.Size,
				'Size',
				ObjectSize.Minimum,
				ObjectSize.Maximum,
			),
			[EditableObjectPropertyId.Opacity]: this.rangeControl(
				EditableObjectPropertyId.Opacity,
				'Opacity',
				Percentage.Minimum,
				Percentage.Maximum,
			),
			[EditableObjectPropertyId.Hardness]: this.rangeControl(
				EditableObjectPropertyId.Hardness,
				'Hardness',
				Percentage.Minimum,
				Percentage.Maximum,
			),
			[EditableObjectPropertyId.Fill]: this.checkboxControl(),
		};
		this.#root.append(
			...Object.values(this.#controls).map((control) => control.row),
		);
		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'compact-action selected-object-continue hidden';
		continueButton.setAttribute('aria-label', 'Continue selected stroke');
		continueButton.textContent = '↝ Continue stroke';
		continueButton.addEventListener('click', this.continueStroke);
		this.#root.append(continueButton);
		parent.prepend(this.#root);
		objects.onChange((_state, change) => {
			if (change !== AnnotationChangeKind.Transient) this.sync();
		});
		this.sync();
	}

	private heading(): HTMLElement {
		const heading = document.createElement('small');
		heading.className = 'tool-section-title';
		heading.textContent = 'Selected object';
		return heading;
	}

	private colorControl(): PropertyControl {
		const { row, input } = this.baseControl(
			EditableObjectPropertyId.Color,
			'Color',
			'color',
		);
		this.bind(input, EditableObjectPropertyId.Color, () => input.value);
		return { row, input };
	}

	private rangeControl(
		property: EditableObjectProperty,
		label: string,
		minimum: number,
		maximum: number,
	): PropertyControl {
		const { row, input } = this.baseControl(property, label, 'range');
		input.min = String(minimum);
		input.max = String(maximum);
		const output = document.createElement('output');
		row.insertBefore(output, input);
		this.bind(input, property, () =>
			property === EditableObjectPropertyId.Size
				? Number(input.value)
				: Number(input.value) / Percentage.Scale,
		);
		return { row, input, output };
	}

	private checkboxControl(): PropertyControl {
		const { row, input } = this.baseControl(
			EditableObjectPropertyId.Fill,
			'Fill shape',
			'checkbox',
		);
		row.classList.add('check');
		this.bind(input, EditableObjectPropertyId.Fill, () => input.checked);
		return { row, input };
	}

	private baseControl(
		property: EditableObjectProperty,
		label: string,
		type: HTMLInputElement['type'],
	): { row: HTMLLabelElement; input: HTMLInputElement } {
		const row = document.createElement('label');
		row.dataset.objectProperty = property;
		row.append(document.createTextNode(label));
		const input = document.createElement('input');
		input.type = type;
		input.setAttribute('aria-label', `Selected object ${label.toLowerCase()}`);
		row.append(input);
		return { row, input };
	}

	private bind(
		input: HTMLInputElement,
		property: EditableObjectProperty,
		read: () => string | number | boolean,
	): void {
		input.addEventListener('input', () => {
			this.#dirtyProperties.add(property);
			this.apply(property, read(), false);
		});
		input.addEventListener('change', () => {
			if (!this.#dirtyProperties.has(property))
				this.apply(property, read(), false);
			this.#dirtyProperties.delete(property);
			this.apply(property, read(), true);
		});
	}

	private apply(
		property: EditableObjectProperty,
		value: string | number | boolean,
		commit: boolean,
	): void {
		if (this.#synchronizing || !this.objects.selected) return;
		if (commit) {
			this.objects.commitCurrent();
			return;
		}
		this.objects.update(
			this.objects.selected.id,
			(object) => setEditableObjectProperty(object, property, value),
			false,
		);
		this.updateOutput(property, value);
	}

	private sync(): void {
		this.#synchronizing = true;
		const selected = this.objects.selected;
		this.#dirtyProperties.clear();
		this.#root.classList.toggle('hidden', !selected);
		this.parent.classList.toggle('editing-selected-object', Boolean(selected));
		if (selected) {
			element<HTMLButtonElement>(
				'.selected-object-continue',
				this.#root,
			).classList.toggle(
				'hidden',
				selected.type !== AnnotationObjectTypeId.Stroke,
			);
			const values = editableObjectProperties(selected);
			for (const [property, control] of Object.entries(this.#controls) as Array<
				[EditableObjectProperty, PropertyControl]
			>) {
				const value = values[property];
				control.row.classList.toggle('hidden', value === undefined);
				if (value === undefined) continue;
				if (typeof value === 'boolean') control.input.checked = value;
				else control.input.value = controlValue(property, value);
				this.updateOutput(property, value);
			}
		}
		if (!selected)
			element<HTMLButtonElement>(
				'.selected-object-continue',
				this.#root,
			).classList.add('hidden');
		this.#synchronizing = false;
	}

	private updateOutput(
		property: EditableObjectProperty,
		value: string | number | boolean,
	): void {
		const output = this.#controls[property].output;
		if (!output || typeof value !== 'number') return;
		const numericValue = value as number;
		output.value =
			property === EditableObjectPropertyId.Size
				? `${Math.round(numericValue)} px`
				: `${Math.round(numericValue <= 1 ? numericValue * Percentage.Scale : numericValue)}%`;
	}
}

function controlValue(
	property: EditableObjectProperty,
	value: string | number,
): string {
	if (
		typeof value === 'number' &&
		(property === EditableObjectPropertyId.Opacity ||
			property === EditableObjectPropertyId.Hardness)
	)
		return String(value * Percentage.Scale);
	return String(value);
}
