import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';
import { ARROW_ENDS, isLineEnd, LINE_END_LABELS, LineEnd, type LineEnds, PLAIN_ENDS } from '../annotations/lineEnd';
import {
	MarkupToolId,
	PaintToolId,
	ShapeToolId,
	type Tool,
} from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { element } from '../../shared/dom/domHelpers';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import type { CanvasViewportController } from '../workspace/canvasViewportController';
import { GenericToolbar } from '../workspace/genericToolbar';
import { GroupedToolPalette } from '../workspace/groupedToolPalette';
import { ToolbarId, toolbarSelector } from '../workspace/toolbarTypes';
import { CropSelectionKind } from './cropSelectionTypes';
import type { StrokeOptions } from './drawingHelpers';
import { colorProfileOwner, colorProfileOwnerOfItem, drawingToolBehavior, isPathTool } from './drawingToolBehavior';
import {
	BRUSH_TOOL_DEFINITIONS,
	DRAWING_TOOL_DEFINITIONS,
	ERASER_TOOL_DEFINITION,
	MARKUP_TOOL_DEFINITIONS,
	SHAPE_MENU_TOOL_DEFINITIONS,
	UTILITY_TOOL_DEFINITIONS,
} from './drawingToolCatalog';
import type { DrawingToolSettings } from './drawingToolSettings';
import type { FloodFillOptions } from './floodFillHelpers';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';
import { ShapeStyleButtons } from './shapeStyleButtons';
import { DEFAULT_TOOL_COLORS, ToolColorsControl, ToolColorTarget } from './toolColorsControl';
import { isShapeStyle, ShapeStyle } from '../annotations/shapeStyle';

const PERCENT_SCALE = 100;
const MarkerNumber = { First: 1, Minimum: 0, Maximum: 9_999 } as const;
/** A highlight marks an area without hiding it. */
const HIGHLIGHT_OPACITY_PERCENT = '35';
const COLOR_CHANNEL_MAXIMUM = 255;
const DrawingControlId = {
	Color: 'colorInput',
	Size: 'sizeInput',
	Opacity: 'opacityInput',
	Hardness: 'hardnessInput',
	ShapeStyle: 'shapeStyleInput',
	FillColor: 'fillColorInput',
	FillTolerance: 'fillToleranceInput',
} as const;
const TOOL_CONTROL_DEFAULTS = {
	[MarkupToolId.Number]: { [DrawingControlId.Color]: ColorPalette.Red },
	[MarkupToolId.Highlight]: {
		[DrawingControlId.Opacity]: HIGHLIGHT_OPACITY_PERCENT,
	},
} as const;
/** Each tool keeps its own size, opacity and hardness; the line colour is shared, except by tools with their own, such as numbered markers. */
const PROFILED_DRAWING_CONTROL_IDS = [
	DrawingControlId.Color,
	DrawingControlId.Size,
	DrawingControlId.Opacity,
	DrawingControlId.Hardness,
] as const;

/** The ends a tool draws until someone chooses others: a pen path is a plain line, other lines are arrows. */
function defaultLineEnds(tool: Tool): LineEnds {
	return isPathTool(tool) ? PLAIN_ENDS : ARROW_ENDS;
}

/** The names of a line's two ends where they are chosen. */
const LineEndChoice = { Start: 'Start', End: 'End' } as const;

/** Toolbar presentation and persisted tool settings; no image mutation. */
export class DrawingToolControls implements DrawingToolSettings {
	readonly #toolsPanel = element<HTMLElement>(toolbarSelector(ToolbarId.Tools));
	readonly #color = element<HTMLInputElement>('#colorInput');
	readonly #size = element<HTMLInputElement>('#sizeInput');
	readonly #sizeLabel = element<HTMLElement>('#sizeLabel');
	readonly #opacity = element<HTMLInputElement>('#opacityInput');
	readonly #hardness = element<HTMLInputElement>('#hardnessInput');
	readonly #paintSelect = element<HTMLSelectElement>('#paintToolSelect');
	readonly #shapeSelect = element<HTMLSelectElement>('#shapeToolSelect');
	readonly #markupSelect = element<HTMLSelectElement>('#markupToolSelect');
	readonly #toolbar: GenericToolbar<Tool>;
	readonly #palette: GroupedToolPalette<Tool>;
	readonly #fillOptions: HTMLElement;
	readonly #fillColor: HTMLInputElement;
	readonly #fillTolerance: HTMLInputElement;
	readonly #pickerOptions: HTMLElement;
	readonly #colors: ToolColorsControl;
	/** The style shape tools draw in, kept in a hidden control so it is remembered with the other settings. */
	readonly #shapeStyleValue = element<HTMLInputElement>('#shapeStyleInput');
	readonly #shapeStyle: ShapeStyleButtons;
	readonly #cropOptions: HTMLElement;
	readonly #markerOptions: HTMLElement | null;
	readonly #lineEndOptions: HTMLElement;
	readonly #lineEndSelects: Readonly<Record<keyof LineEnds, HTMLSelectElement>>;
	/** Each tool's own ends: an elbow arrow starts with an arrowhead, a pen path with none. */
	readonly #lineEndsByTool = new Map<Tool, LineEnds>();
	#cropSelectionKind: CropSelectionKind = CropSelectionKind.Rectangle;
	readonly #contextHint: HTMLElement;
	readonly #selectedObjectProperties?: SelectedObjectPropertiesController;
	#restoredColor = false;

	constructor(
		documentModel: CanvasDocument,
		shapes: AnnotationDocument | undefined,
		viewport: CanvasViewportController | undefined,
		private readonly cancelCrop: () => void,
	) {
		const fillControls = this.createFillOptions();
		this.#fillOptions = fillControls.root;
		this.#fillColor = fillControls.color;
		this.#fillTolerance = fillControls.tolerance;
		this.#pickerOptions = this.createPickerOptions();
		this.#cropOptions = this.createCropOptions();
		const lineEndControls = this.createLineEndOptions();
		this.#lineEndOptions = lineEndControls.root;
		this.#lineEndSelects = lineEndControls.selects;
		this.#markerOptions = shapes ? this.createMarkerOptions(shapes) : null;
		this.#contextHint = this.createContextHint();
		// The colours come first in the tool options, where every tool that paints shows them.
		this.#colors = new ToolColorsControl(this.#color, this.#fillColor, () => this.#toolbar.persist());
		this.#shapeStyle = this.createShapeStyle();
		element('.tool-options', this.#toolsPanel).prepend(this.#colors.element, this.#shapeStyle.element);
		if (shapes)
			this.#selectedObjectProperties = new SelectedObjectPropertiesController(
				shapes,
				element('.tool-options', this.#toolsPanel),
				(object, color) => this.#toolbar.setProfileControl(colorProfileOwnerOfItem(object.type), DrawingControlId.Color, color),
				(color) => this.#colors.set(ToolColorTarget.Fill, color),
				{ fillColor: () => this.#colors.fillColor, chooseShapeStyle: (style) => this.setShapeStyle(style) },
			);
		// The tools' colours stay first, above a selected item's own properties.
		element('.tool-options', this.#toolsPanel).prepend(this.#colors.element);
		this.#toolbar = new GenericToolbar<Tool>({
			root: this.#toolsPanel,
			tools: DRAWING_TOOL_DEFINITIONS,
			selectGroups: [
				{
					control: element('#paintToolControl'),
					icon: element('.tool-select-icon', element('#paintToolControl')),
					select: this.#paintSelect,
					tools: BRUSH_TOOL_DEFINITIONS,
					defaultTool: PaintToolId.Brush,
				},
				{
					control: element('#shapeToolControl'),
					icon: element('.tool-select-icon', element('#shapeToolControl')),
					select: this.#shapeSelect,
					tools: SHAPE_MENU_TOOL_DEFINITIONS,
					defaultTool: ShapeToolId.Rectangle,
				},
				{
					control: element('#markupToolControl'),
					icon: element('.tool-select-icon', element('#markupToolControl')),
					select: this.#markupSelect,
					tools: MARKUP_TOOL_DEFINITIONS,
					defaultTool: MarkupToolId.Number,
				},
			],
			buttonContainer: element('.utility-tools'),
			buttonTools: [ERASER_TOOL_DEFINITION, ...UTILITY_TOOL_DEFINITIONS],
			defaultTool: PaintToolId.Brush,
			documentModel,
			stateKey: 'drawing',
			profiledControlIds: PROFILED_DRAWING_CONTROL_IDS,
			profileOwner: (tool, controlId) => (controlId === DrawingControlId.Color ? colorProfileOwner(tool) : tool),
			toolDefaults: TOOL_CONTROL_DEFAULTS,
		});
		element('.tool-choosers').classList.add('hidden');
		this.#palette = new GroupedToolPalette<Tool>(
			element('.utility-tools'),
			[
				{
					label: 'Brush tools',
					select: this.#paintSelect,
					tools: BRUSH_TOOL_DEFINITIONS,
				},
				{
					label: 'Shape tools',
					select: this.#shapeSelect,
					tools: SHAPE_MENU_TOOL_DEFINITIONS,
				},
				{
					label: 'Markup tools',
					select: this.#markupSelect,
					tools: MARKUP_TOOL_DEFINITIONS,
				},
			],
			this.#toolbar.activeTool,
			(tool) => this.#toolbar.select(tool),
		);
		if (viewport) this.createViewOptions(viewport);
		this.#restoredColor = this.#toolbar.restoredControlIds.has(
			DrawingControlId.Color,
		);
		this.syncRangeLabels();
		this.#toolbar.onSelection((tool) => {
			this.#palette.update(tool);
			this.updateToolOptions(tool);
			this.syncRangeLabels();
		});
		this.updateToolOptions(this.tool);
		this.bindRange(this.#size, '#sizeValue', (value) => `${value} px`);
		this.bindRange(this.#opacity, '#opacityValue', (value) => `${value}%`);
		this.bindRange(this.#hardness, '#hardnessValue', (value) => `${value}%`);
		this.bindRange(
			this.#fillTolerance,
			'#fillToleranceValue',
			(value) => value,
		);
	}

	get tool(): Tool {
		return this.#toolbar.activeTool;
	}
	get shapeStyle(): ShapeStyle {
		return isShapeStyle(this.#shapeStyleValue.value) ? this.#shapeStyleValue.value : ShapeStyle.Outline;
	}
	/** The fill colour: what shapes and paths are filled with, and what the Fill tool pours. */
	get fillColor(): string {
		return this.#colors.fillColor;
	}
	/** Makes a picked colour the line or the fill colour. */
	pickColor(color: string, target: ToolColorTarget): void {
		this.#colors.set(target, color);
	}
	swapColors(): void {
		this.#colors.swap();
	}
	resetColors(): void {
		this.#colors.reset();
	}
	lineEnds(): LineEnds {
		return this.#lineEndsByTool.get(this.tool) ?? defaultLineEnds(this.tool);
	}
	get cropSelectionKind(): CropSelectionKind {
		return this.#cropSelectionKind;
	}

	onSelection(listener: (tool: Tool) => void): void {
		this.#toolbar.onSelection(listener);
	}

	fillOptions(): FloodFillOptions {
		return {
			color: this.#colors.fillColor,
			opacity: Number(this.#opacity.value) / PERCENT_SCALE,
			tolerance: Math.min(
				COLOR_CHANNEL_MAXIMUM,
				Number(this.#fillTolerance.value),
			),
		};
	}

	setInitialColor(theme: string): void {
		if (this.#restoredColor) return;
		this.#color.value =
			theme === 'light' ? ColorPalette.Black : ColorPalette.White;
		this.#toolbar.refreshDefaults();
		this.#toolbar.persist();
	}

	select(tool: Tool): void {
		this.#toolbar.select(tool);
	}

	strokeOptions(): StrokeOptions {
		return {
			color: this.#colors.lineColor,
			size: Number(this.#size.value),
			opacity: Number(this.#opacity.value) / PERCENT_SCALE,
			hardness: Number(this.#hardness.value) / PERCENT_SCALE,
		};
	}

	private bindRange(
		input: HTMLInputElement,
		outputSelector: string,
		format: (value: string) => string,
	): void {
		input.addEventListener('input', () => {
			element(outputSelector).textContent = format(input.value);
		});
	}

	private syncRangeLabels(): void {
		element('#sizeValue').textContent = `${this.#size.value} px`;
		element('#opacityValue').textContent = `${this.#opacity.value}%`;
		element('#hardnessValue').textContent = `${this.#hardness.value}%`;
		element('#fillToleranceValue').textContent = this.#fillTolerance.value;
	}

	private updateToolOptions(tool: Tool): void {
		const behavior = drawingToolBehavior(tool);
		const options = behavior.options;
		this.#selectedObjectProperties?.setTool(tool);
		this.#hardness
			.closest('label')!
			.classList.toggle('hidden', !options.hardness);
		this.#size.closest('label')!.classList.toggle('hidden', !options.size);
		if (behavior.sizeLabel) this.#sizeLabel.textContent = behavior.sizeLabel;
		this.#shapeStyle.element.classList.toggle('hidden', !options.shapeFill);
		this.#shapeStyle.show(this.shapeStyle);
		this.#opacity
			.closest('label')!
			.classList.toggle('hidden', !options.opacity);
		this.#fillOptions.classList.toggle('hidden', !options.fill);
		this.#pickerOptions.classList.toggle('hidden', !options.picker);
		this.#cropOptions.classList.toggle('hidden', !options.crop);
		this.#markerOptions?.classList.toggle('hidden', !options.marker);
		this.#lineEndOptions.classList.toggle('hidden', !options.lineEnds);
		if (options.lineEnds) {
			const ends = this.lineEnds();
			this.#lineEndSelects.head.value = ends.head;
			this.#lineEndSelects.tail.value = ends.tail;
		}
		this.#contextHint.classList.toggle('hidden', !options.zoom);
	}

	private createFillOptions(): {
		root: HTMLElement;
		color: HTMLInputElement;
		tolerance: HTMLInputElement;
	} {
		const root = document.createElement('div');
		root.className = 'fill-tool-options hidden';
		root.innerHTML = `<label>Tolerance <span id="fillToleranceValue">32</span><input id="fillToleranceInput" type="range" min="0" max="255" value="32"></label>`;
		element('.tool-options', this.#toolsPanel).prepend(root);
		// The fill colour joins the line colour in the colour control, as a second colour does in painting programs.
		const fillColor = document.createElement('input');
		fillColor.id = DrawingControlId.FillColor;
		fillColor.type = 'color';
		// A fresh start has the colours a reset gives.
		fillColor.value = DEFAULT_TOOL_COLORS.fill;
		return {
			root,
			color: fillColor,
			tolerance: element<HTMLInputElement>('#fillToleranceInput', root),
		};
	}

	/** The Picker needs no settings: a click picks the line colour and Alt/Option-click the fill colour. */
	private createPickerOptions(): HTMLElement {
		const root = document.createElement('div');
		root.className = 'picker-tool-options hidden';
		root.innerHTML = '<p class="tool-hint">Click to pick the line colour. Alt/Option-click to pick the fill colour.</p>';
		element('.tool-options', this.#toolsPanel).prepend(root);
		return root;
	}

	/** The style shape tools draw in: outline, fill, or both. */
	private createShapeStyle(): ShapeStyleButtons {
		const buttons = new ShapeStyleButtons('Shape style', (style) => this.setShapeStyle(style));
		buttons.element.append(this.#shapeStyleValue);
		return buttons;
	}

	/** Makes a style the one shape tools draw in, and remembers it. */
	private setShapeStyle(style: ShapeStyle): void {
		this.#shapeStyleValue.value = style;
		this.#shapeStyle.show(style);
		this.#toolbar.persist();
	}

	/** A choice of end for each end of a line, from every end a line can have. */
	private createLineEndOptions(): { root: HTMLElement; selects: Record<keyof LineEnds, HTMLSelectElement> } {
		const root = document.createElement('div');
		root.className = 'line-end-options hidden';
		const select = (label: string, id: string, chosen: LineEnd): HTMLSelectElement => {
			const wrapper = document.createElement('label');
			wrapper.textContent = label;
			const input = document.createElement('select');
			input.id = id;
			for (const end of Object.values(LineEnd)) input.add(new Option(LINE_END_LABELS[end], end, false, end === chosen));
			wrapper.append(input);
			root.append(wrapper);
			return input;
		};
		const selects = {
			tail: select(LineEndChoice.Start, 'lineTailSelect', ARROW_ENDS.tail),
			head: select(LineEndChoice.End, 'lineHeadSelect', ARROW_ENDS.head),
		};
		const remember = () => {
			const chosen = (input: HTMLSelectElement, fallback: LineEnd) => (isLineEnd(input.value) ? input.value : fallback);
			const fallback = defaultLineEnds(this.tool);
			this.#lineEndsByTool.set(this.tool, { head: chosen(selects.head, fallback.head), tail: chosen(selects.tail, fallback.tail) });
		};
		for (const input of Object.values(selects)) input.addEventListener('change', remember);
		element('.tool-options', this.#toolsPanel).append(root);
		return { root, selects };
	}

	private createCropOptions(): HTMLElement {
		const root = document.createElement('div');
		root.className = 'crop-tool-options hidden';
		root.innerHTML = `<p class="tool-hint">Start on the image or object you want to cut, select an area, then drag the cut-out to move it. Image cuts create a new layer.</p>
			<div class="crop-selection-modes" role="group" aria-label="Crop selection mode">
				<button type="button" class="crop-mode-button active" data-crop-selection-kind="${CropSelectionKind.Rectangle}" aria-label="Rectangle crop selection" aria-pressed="true" title="Rectangle selection">
					${editorIconMarkup(EditorIconId.RectangleSelection)}<span>Rectangle</span>
				</button>
				<button type="button" class="crop-mode-button" data-crop-selection-kind="${CropSelectionKind.Lasso}" aria-label="Lasso crop selection" aria-pressed="false" title="Freehand lasso selection">
					${editorIconMarkup(EditorIconId.Lasso)}<span>Lasso</span>
				</button>
			</div>
			<div class="context-actions"><button type="button" data-cancel-crop>Cancel</button></div>`;
		for (const button of root.querySelectorAll<HTMLButtonElement>(
			'[data-crop-selection-kind]',
		))
			button.addEventListener('click', () => {
				const kind = button.dataset.cropSelectionKind;
				if (!isCropSelectionKind(kind)) return;
				this.#cropSelectionKind = kind;
				for (const candidate of root.querySelectorAll<HTMLButtonElement>(
					'[data-crop-selection-kind]',
				)) {
					const active = candidate === button;
					candidate.classList.toggle('active', active);
					candidate.setAttribute('aria-pressed', String(active));
				}
				this.cancelCrop();
			});
		element<HTMLButtonElement>('[data-cancel-crop]', root).addEventListener(
			'click',
			() => this.cancelCrop(),
		);
		element('.tool-options', this.#toolsPanel).prepend(root);
		return root;
	}

	/** The next number a marker gets; it belongs to the document, so it is not persisted here. */
	private createMarkerOptions(shapes: AnnotationDocument): HTMLElement {
		const root = document.createElement('div');
		// The next number stays in view while the marker just placed is selected.
		root.className = 'marker-tool-options tool-option-persistent hidden';
		const label = document.createElement('label');
		label.textContent = 'Next number ';
		const next = document.createElement('input');
		next.type = 'number';
		next.className = 'marker-next-number';
		next.min = String(MarkerNumber.Minimum);
		next.max = String(MarkerNumber.Maximum);
		next.step = '1';
		next.setAttribute('aria-label', 'Next marker number');
		label.append(next);
		const reset = document.createElement('button');
		reset.type = 'button';
		reset.className = 'marker-reset';
		reset.innerHTML = `${editorIconMarkup(EditorIconId.Reset)}<span>Reset to ${MarkerNumber.First}</span>`;
		root.append(label, reset);
		next.addEventListener('change', () => {
			const value = Number(next.value);
			if (Number.isInteger(value)) shapes.restartSteps(value);
		});
		reset.addEventListener('click', () =>
			shapes.restartSteps(MarkerNumber.First),
		);
		shapes.onChange((state) => {
			if (document.activeElement !== next) next.value = String(state.nextStep);
		});
		element('.tool-options', this.#toolsPanel).prepend(root);
		return root;
	}

	private createContextHint(): HTMLElement {
		const hint = document.createElement('p');
		hint.className = 'tool-hint zoom-tool-hint hidden';
		hint.textContent = 'Click to zoom in. Alt/Option-click to zoom out.';
		element('.tool-options', this.#toolsPanel).prepend(hint);
		return hint;
	}

	private createViewOptions(viewport: CanvasViewportController): HTMLElement {
		const options = document.createElement('div');
		options.className = 'zoom-tool-options';
		options.setAttribute('aria-label', 'View zoom controls');
		const heading = document.createElement('small');
		heading.className = 'tool-section-title';
		heading.textContent = 'View';
		const actions: ReadonlyArray<readonly [string, string, () => void, EditorIconId?]> = [
			['−', 'Zoom out', () => viewport.zoomOut(), EditorIconId.Minus],
			['+', 'Zoom in', () => viewport.zoomIn(), EditorIconId.Plus],
			['Fit', 'Fit image to window', () => viewport.fitToWindow()],
			['100%', 'Actual pixels', () => viewport.actualPixels()],
		];
		options.append(
			heading,
			...actions.map(([label, title, action, icon]) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = label;
				if (icon) {
					button.innerHTML = editorIconMarkup(icon);
					button.setAttribute('aria-label', title);
				}
				button.title = title;
				button.addEventListener('click', action);
				return button;
			}),
		);
		this.#toolsPanel.querySelector('.panel-body')!.append(options);
		return options;
	}
}

function isCropSelectionKind(
	value: string | undefined,
): value is CropSelectionKind {
	return Object.values(CropSelectionKind).some((kind) => kind === value);
}
