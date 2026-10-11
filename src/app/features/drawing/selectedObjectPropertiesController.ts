import { type Tool, UtilityToolId } from '../../core/document/appTypes';
import {
	type AnnotationDocument,
	isEphemeralAnnotationChange,
} from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';
import { drawingToolBehavior, ToolOptionSource } from './drawingToolBehavior';
import {
	EditableObjectPropertyId,
	editableObjectProperties,
	setEditableObjectProperty,
	type EditableObjectProperty,
} from '../annotations/editableObjectProperties';

const Percentage = {
	Scale: 100,
	Minimum: 1,
	Maximum: 100,
} as const;
const ObjectSize = { Minimum: 1, Maximum: 200 } as const;
/** What each control says beside it; a shape's colour is its line, beside its fill. */
const PropertyLabel = {
	Color: 'Color',
	Line: 'Line',
	Size: 'Size',
	Opacity: 'Opacity',
	Hardness: 'Hardness',
	Fill: 'Fill',
} as const;
/** How assistive technology names each control, whatever it says beside it. */
const ACCESSIBLE_NAMES: Readonly<Record<EditableObjectProperty, string>> = {
	[EditableObjectPropertyId.Color]: 'color',
	[EditableObjectPropertyId.Size]: 'size',
	[EditableObjectPropertyId.Opacity]: 'opacity',
	[EditableObjectPropertyId.Hardness]: 'hardness',
	[EditableObjectPropertyId.Fill]: 'fill',
	[EditableObjectPropertyId.FillColor]: 'fill colour',
};

interface PropertyControl {
	readonly row: HTMLElement;
	readonly label: Text;
	readonly input: HTMLInputElement;
	readonly output?: HTMLOutputElement;
}

export class SelectedObjectPropertiesController {
	readonly #root = document.createElement('section');
	readonly #controls: Readonly<Record<EditableObjectProperty, PropertyControl>>;
	readonly #dirtyProperties = new Set<EditableObjectProperty>();
	#synchronizing = false;
	#tool: Tool | null = null;

	constructor(
		private readonly objects: AnnotationDocument,
		private readonly parent: HTMLElement,
		private readonly onColorChange?: (
			object: Readonly<AnnotationObject>,
			color: string,
		) => void,
	) {
		this.#root.className = 'selected-object-options hidden';
		this.#root.setAttribute('aria-label', 'Selected object properties');
		this.#controls = {
			[EditableObjectPropertyId.Color]: this.colorControl(EditableObjectPropertyId.Color, PropertyLabel.Color),
			[EditableObjectPropertyId.Size]: this.rangeControl(
				EditableObjectPropertyId.Size,
				PropertyLabel.Size,
				ObjectSize.Minimum,
				ObjectSize.Maximum,
			),
			[EditableObjectPropertyId.Opacity]: this.rangeControl(
				EditableObjectPropertyId.Opacity,
				PropertyLabel.Opacity,
				Percentage.Minimum,
				Percentage.Maximum,
			),
			[EditableObjectPropertyId.Hardness]: this.rangeControl(
				EditableObjectPropertyId.Hardness,
				PropertyLabel.Hardness,
				Percentage.Minimum,
				Percentage.Maximum,
			),
			[EditableObjectPropertyId.Fill]: this.checkboxControl(),
			[EditableObjectPropertyId.FillColor]: this.fillColorControl(),
		};
		// The fill colour sits on the Fill row, right after the checkbox that names it.
		const { [EditableObjectPropertyId.FillColor]: fillColor, ...rows } = this.#controls;
		this.#controls[EditableObjectPropertyId.Fill].row.append(fillColor.row);
		this.#root.append(...Object.values(rows).map((control) => control.row));
		parent.prepend(this.#root);
		objects.onChange((_state, change) => {
			if (!isEphemeralAnnotationChange(change)) this.sync();
		});
		this.sync();
	}

	/**
	 * Item properties follow the tool: tools with contextual options show them,
	 * and brush strokes are restyled only with Select, so paint tools keep
	 * their own brush settings in view.
	 */
	setTool(tool: Tool): void {
		if (this.#tool === tool) return;
		this.#tool = tool;
		this.sync();
	}

	private showsPropertiesOf(item: AnnotationObject): boolean {
		if (
			this.#tool !== null &&
			drawingToolBehavior(this.#tool).optionSource !==
				ToolOptionSource.Contextual
		)
			return false;
		return (
			item.type !== AnnotationObjectTypeId.Stroke ||
			this.#tool === UtilityToolId.Select
		);
	}

	private colorControl(property: typeof EditableObjectPropertyId.Color, label: string): PropertyControl {
		const control = this.baseControl(property, label, 'color');
		this.bind(control.input, property, () => control.input.value);
		return control;
	}

	/** A swatch without words of its own, placed on the Fill row; a click on it opens the colour, not the checkbox. */
	private fillColorControl(): PropertyControl {
		const row = document.createElement('span');
		row.dataset.objectProperty = EditableObjectPropertyId.FillColor;
		row.className = 'fill-color-option';
		const input = document.createElement('input');
		input.type = 'color';
		input.setAttribute('aria-label', `Selected object ${ACCESSIBLE_NAMES[EditableObjectPropertyId.FillColor]}`);
		row.append(input);
		this.bind(input, EditableObjectPropertyId.FillColor, () => input.value);
		return { row, label: document.createTextNode(''), input };
	}

	private rangeControl(
		property: EditableObjectProperty,
		label: string,
		minimum: number,
		maximum: number,
	): PropertyControl {
		const { row, label: text, input } = this.baseControl(property, label, 'range');
		input.min = String(minimum);
		input.max = String(maximum);
		const output = document.createElement('output');
		row.insertBefore(output, input);
		this.bind(input, property, () =>
			property === EditableObjectPropertyId.Size
				? Number(input.value)
				: Number(input.value) / Percentage.Scale,
		);
		return { row, label: text, input, output };
	}

	private checkboxControl(): PropertyControl {
		const control = this.baseControl(EditableObjectPropertyId.Fill, PropertyLabel.Fill, 'checkbox');
		control.row.classList.add('check');
		this.bind(control.input, EditableObjectPropertyId.Fill, () => control.input.checked);
		return control;
	}

	private baseControl(
		property: EditableObjectProperty,
		label: string,
		type: HTMLInputElement['type'],
	): PropertyControl {
		const row = document.createElement('label');
		row.dataset.objectProperty = property;
		const text = document.createTextNode(label);
		row.append(text);
		const input = document.createElement('input');
		input.type = type;
		input.setAttribute('aria-label', `Selected object ${ACCESSIBLE_NAMES[property]}`);
		row.append(input);
		return { row, label: text, input };
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
		const selected = this.objects.selected;
		if (
			property === EditableObjectPropertyId.Color &&
			selected &&
			'color' in selected
		)
			this.onColorChange?.(selected, selected.color);
	}

	private sync(): void {
		this.#synchronizing = true;
		const selected = this.objects.selected;
		this.#dirtyProperties.clear();
		const propertiesVisible =
			selected !== null && this.showsPropertiesOf(selected);
		this.#root.classList.toggle('hidden', !propertiesVisible);
		this.parent.classList.toggle('editing-selected-object', propertiesVisible);
		if (selected && propertiesVisible) {
			const values = editableObjectProperties(selected);
			this.#controls[EditableObjectPropertyId.Color].label.data = values.fill === undefined ? PropertyLabel.Color : PropertyLabel.Line;
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
