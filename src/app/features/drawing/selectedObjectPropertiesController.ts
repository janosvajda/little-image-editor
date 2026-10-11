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
	fillColorOf,
	setEditableObjectProperty,
	type EditableObjectProperty,
	FillStyle,
} from '../annotations/editableObjectProperties';
import { PatternSize } from '../../core/geometry/fillPattern';
import { LiveItemEdit } from './liveItemEdit';
import { layerItemLabel } from '../layers/layerItemLabels';
import { ShapeStyleButtons } from './shapeStyleButtons';
import { applyShapeStyle, ShapeStyle, shapeStyleOf } from '../annotations/shapeStyle';
import { ObjectClipActions } from './objectClipActions';
import { SelectedObjectEffects } from './selectedObjectEffects';
import type { SelectedObjectSection } from './selectedObjectSection';

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
	PatternSize: 'Pattern size',
} as const;
/** How assistive technology names each control, whatever it says beside it. */
const ACCESSIBLE_NAMES: Readonly<Record<EditableObjectProperty, string>> = {
	[EditableObjectPropertyId.Color]: 'color',
	[EditableObjectPropertyId.Size]: 'size',
	[EditableObjectPropertyId.Opacity]: 'opacity',
	[EditableObjectPropertyId.Hardness]: 'hardness',
	[EditableObjectPropertyId.Fill]: 'fill',
	[EditableObjectPropertyId.FillColor]: 'fill colour',
	[EditableObjectPropertyId.FillStyle]: 'fill style',
	[EditableObjectPropertyId.FillColorEnd]: 'fill end colour',
	[EditableObjectPropertyId.PatternSize]: 'pattern size',
};
/** What an item that could be filled, but is not, says on its fill swatch. */
const NO_FILL_TITLE = 'No fill: choose a colour to fill it';
/** Properties measured in image pixels; the others are shares, shown as percentages. */
const PIXEL_PROPERTIES: ReadonlySet<EditableObjectProperty> = new Set([EditableObjectPropertyId.Size, EditableObjectPropertyId.PatternSize]);
/** The names of the ways to fill, where one is chosen. */
const FILL_STYLE_LABELS: Readonly<Record<FillStyle, string>> = {
	[FillStyle.Solid]: 'Solid',
	[FillStyle.Linear]: 'Linear',
	[FillStyle.Radial]: 'Radial',
	[FillStyle.Stripes]: 'Stripes',
	[FillStyle.Dots]: 'Dots',
	[FillStyle.Grid]: 'Grid',
	[FillStyle.Checks]: 'Checks',
};

/** The properties shown as a control row of their own; filling is chosen as a style instead. */
type RowProperty = Exclude<EditableObjectProperty, typeof EditableObjectPropertyId.Fill>;

/** What the bar shares with the tools: the fill colour a new fill starts from, and the style chosen last. */
export interface SharedToolColors {
	fillColor(): string;
	/** A style chosen for an item becomes the shape tools' style too, as its colours become theirs. */
	chooseShapeStyle(style: ShapeStyle): void;
}

interface PropertyControl {
	readonly row: HTMLElement;
	readonly label: Text;
	readonly input: HTMLInputElement | HTMLSelectElement;
	readonly output?: HTMLOutputElement;
}

export class SelectedObjectPropertiesController {
	readonly #root = document.createElement('section');
	readonly #controls: Readonly<Record<RowProperty, PropertyControl>>;
	/** Outline, fill, or both, for a shape or a path. */
	readonly #shapeStyle: ShapeStyleButtons;
	/** What the selected item is, as its section's title, as the Layers panel names it. */
	readonly #title = document.createElement('h3');
	readonly #edit: LiveItemEdit;
	/** Effects and clipping, after the item's own properties. */
	readonly #sections: readonly SelectedObjectSection[];
	#tool: Tool | null = null;

	constructor(
		private readonly objects: AnnotationDocument,
		private readonly parent: HTMLElement,
		private readonly onColorChange?: (
			object: Readonly<AnnotationObject>,
			color: string,
		) => void,
		/** A fill colour chosen for an item becomes the tools' fill colour too, as its line colour becomes theirs. */
		private readonly onFillColorChange?: (color: string) => void,
		private readonly toolColors?: SharedToolColors,
	) {
		this.#root.className = 'selected-object-options hidden';
		this.#root.setAttribute('aria-label', 'Selected object properties');
		this.#edit = new LiveItemEdit(objects);
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
			[EditableObjectPropertyId.FillStyle]: this.fillStyleControl(),
			[EditableObjectPropertyId.FillColor]: this.swatchControl(EditableObjectPropertyId.FillColor),
			[EditableObjectPropertyId.FillColorEnd]: this.swatchControl(EditableObjectPropertyId.FillColorEnd),
			[EditableObjectPropertyId.PatternSize]: this.rangeControl(
				EditableObjectPropertyId.PatternSize,
				PropertyLabel.PatternSize,
				PatternSize.Minimum,
				PatternSize.Maximum,
			),
		};
		// The fill's kind and its second colour sit beside the word Fill, in one group; a pattern's size follows on its own row.
		const {
			[EditableObjectPropertyId.FillStyle]: style,
			[EditableObjectPropertyId.FillColor]: first,
			[EditableObjectPropertyId.FillColorEnd]: last,
			...rows
		} = this.#controls;
		const fillGroup = document.createElement('div');
		fillGroup.className = 'fill-group';
		const fillWord = document.createElement('span');
		fillWord.dataset.objectProperty = EditableObjectPropertyId.Fill;
		fillWord.className = 'fill-group-label';
		fillWord.textContent = PropertyLabel.Fill;
		fillGroup.append(fillWord, first.row, style.row, last.row);
		this.#shapeStyle = new ShapeStyleButtons('Selected object style', (shapeStyle) => this.chooseShapeStyle(shapeStyle));
		this.#sections = [new SelectedObjectEffects(this.#edit), new ObjectClipActions(objects)];
		// Its own section, titled with what it is: its line, its fill, how it is drawn, then the rest.
		this.#title.className = 'selected-object-title';
		const { [EditableObjectPropertyId.Color]: line, ...others } = rows;
		this.#root.append(this.#title, line.row, fillGroup, this.#shapeStyle.element, ...Object.values(others).map((control) => control.row), ...this.#sections.map(({ element }) => element));
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
	private swatchControl(property: typeof EditableObjectPropertyId.FillColor | typeof EditableObjectPropertyId.FillColorEnd): PropertyControl {
		const input = document.createElement('input');
		input.type = 'color';
		const row = this.inlineControl(property, input);
		this.bind(input, property, () => input.value);
		return { row, label: document.createTextNode(''), input };
	}

	/** Solid, linear or radial, on the Fill row. */
	private fillStyleControl(): PropertyControl {
		const select = document.createElement('select');
		for (const style of Object.values(FillStyle)) select.add(new Option(FILL_STYLE_LABELS[style], style));
		const row = this.inlineControl(EditableObjectPropertyId.FillStyle, select);
		this.bind(select, EditableObjectPropertyId.FillStyle, () => select.value);
		return { row, label: document.createTextNode(''), input: select };
	}

	private inlineControl(property: EditableObjectProperty, input: HTMLInputElement | HTMLSelectElement): HTMLElement {
		const row = document.createElement('span');
		row.dataset.objectProperty = property;
		row.className = 'fill-color-option';
		input.setAttribute('aria-label', `Selected object ${ACCESSIBLE_NAMES[property]}`);
		row.append(input);
		return row;
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
			PIXEL_PROPERTIES.has(property)
				? Number(input.value)
				: Number(input.value) / Percentage.Scale,
		);
		return { row, label: text, input, output };
	}

	/** Draws the selected shape or path as an outline, a fill or both, in one undo step; a new fill starts from the tools' fill colour. */
	private chooseShapeStyle(shapeStyle: ShapeStyle): void {
		const selected = this.objects.selected;
		if (!selected || (selected.type !== AnnotationObjectTypeId.Shape && selected.type !== AnnotationObjectTypeId.Path)) return;
		const fillColor = this.toolColors?.fillColor() ?? fillColorOf(selected) ?? selected.color;
		this.objects.update(selected.id, (item) => applyShapeStyle(item as typeof selected, shapeStyle, fillColor));
		this.toolColors?.chooseShapeStyle(shapeStyle);
	}

	private baseControl(
		property: EditableObjectProperty,
		label: string,
		type: HTMLInputElement['type'],
	): PropertyControl & { readonly input: HTMLInputElement } {
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
		input: HTMLInputElement | HTMLSelectElement,
		property: EditableObjectProperty,
		read: () => string | number | boolean,
	): void {
		this.#edit.bind(
			input,
			property,
			read,
			(object, value) => setEditableObjectProperty(object, property, value),
			(value) => this.edited(property, value),
		);
	}

	/** After an edit: its value shows beside its control, and a new colour is remembered for the item's tool. */
	private edited(property: EditableObjectProperty, value: string | number | boolean): void {
		this.updateOutput(property, value);
		const selected = this.objects.selected;
		if (
			property === EditableObjectPropertyId.Color &&
			selected &&
			'color' in selected
		)
			this.onColorChange?.(selected, selected.color);
		if (property === EditableObjectPropertyId.FillColor && typeof value === 'string') this.onFillColorChange?.(value);
	}

	private sync(): void {
		this.#edit.show(() => {
			const selected = this.objects.selected;
			const propertiesVisible =
				selected !== null && this.showsPropertiesOf(selected);
			this.#root.classList.toggle('hidden', !propertiesVisible);
			this.parent.classList.toggle('editing-selected-object', propertiesVisible);
			if (!selected || !propertiesVisible) return;
			const values = editableObjectProperties(selected);
			this.#title.textContent = layerItemLabel(selected);
			this.#controls[EditableObjectPropertyId.Color].label.data = values.fill === undefined ? PropertyLabel.Color : PropertyLabel.Line;
			// An item that could be filled but is not shows No fill on its fill swatch; choosing a colour there fills it.
			const unfilled = values.fill === false;
			const shown = unfilled ? { ...values, fillColor: fillColorOf(selected) } : values;
			const fillSwatch = this.#controls[EditableObjectPropertyId.FillColor];
			fillSwatch.row.classList.toggle('no-fill', unfilled);
			fillSwatch.input.title = unfilled ? NO_FILL_TITLE : '';
			for (const [property, control] of Object.entries(this.#controls) as Array<[RowProperty, PropertyControl]>)
				this.showValue(property, control, shown[property]);
			this.showShapeStyle(selected, values.fill);
			for (const section of this.#sections) section.element.classList.toggle('hidden', !section.show(selected));
		});
	}

	/** A shape's or path's fill and style; anything else has neither. */
	private showShapeStyle(selected: Readonly<AnnotationObject>, fill: boolean | undefined): void {
		const fillable = fill !== undefined && 'width' in selected;
		// Its fill swatch stays in view, showing No fill when there is none.
		this.#root.querySelector<HTMLElement>('.fill-group')!.classList.toggle('hidden', !fillable);
		this.#shapeStyle.element.classList.toggle('hidden', !fillable);
		if (!fillable) return;
		const shapeStyle = shapeStyleOf({ fill, width: selected.width });
		this.#shapeStyle.show(shapeStyle);
		// A fill without a line has no line width to set.
		if (shapeStyle === ShapeStyle.Fill) this.#controls[EditableObjectPropertyId.Size].row.classList.add('hidden');
	}

	/** One control showing the selected item's value, or hidden when the item has none. */
	private showValue(property: EditableObjectProperty, control: PropertyControl, value: string | number | boolean | undefined): void {
		control.row.classList.toggle('hidden', value === undefined);
		if (value === undefined) return;
		if (typeof value !== 'boolean') control.input.value = controlValue(property, value);
		else if (control.input instanceof HTMLInputElement) control.input.checked = value;
		this.updateOutput(property, value);
	}

	private updateOutput(
		property: EditableObjectProperty,
		value: string | number | boolean,
	): void {
		const output = property === EditableObjectPropertyId.Fill ? undefined : this.#controls[property].output;
		if (!output || typeof value !== 'number') return;
		const numericValue = value as number;
		output.value =
			PIXEL_PROPERTIES.has(property)
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
