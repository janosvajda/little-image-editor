import {
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
import { drawingToolBehavior, ToolOptionSource } from './drawingToolBehavior';
import {
	BRUSH_TOOL_DEFINITIONS,
	DRAWING_TOOL_DEFINITIONS,
	ERASER_TOOL_DEFINITION,
	SHAPE_TOOL_DEFINITIONS,
	UTILITY_TOOL_DEFINITIONS,
} from './drawingToolCatalog';
import type { DrawingToolSettings } from './drawingToolSettings';
import type { FloodFillOptions } from './floodFillHelpers';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';

const PERCENT_SCALE = 100;
const COLOR_CHANNEL_MAXIMUM = 255;
const DrawingControlId = {
	Color: 'colorInput',
	Size: 'sizeInput',
	Opacity: 'opacityInput',
	Hardness: 'hardnessInput',
	Fill: 'fillInput',
	FillColor: 'fillColorInput',
	FillTolerance: 'fillToleranceInput',
} as const;
const PROFILED_DRAWING_CONTROL_IDS = [
	DrawingControlId.Size,
	DrawingControlId.Opacity,
	DrawingControlId.Hardness,
] as const;

/** Toolbar presentation and persisted tool settings; no image mutation. */
export class DrawingToolControls implements DrawingToolSettings {
	readonly #toolsPanel = element<HTMLElement>(toolbarSelector(ToolbarId.Tools));
	readonly #color = element<HTMLInputElement>('#colorInput');
	readonly #size = element<HTMLInputElement>('#sizeInput');
	readonly #sizeLabel = element<HTMLElement>('#sizeLabel');
	readonly #opacity = element<HTMLInputElement>('#opacityInput');
	readonly #hardness = element<HTMLInputElement>('#hardnessInput');
	readonly #fill = element<HTMLInputElement>('#fillInput');
	readonly #paintSelect = element<HTMLSelectElement>('#paintToolSelect');
	readonly #shapeSelect = element<HTMLSelectElement>('#shapeToolSelect');
	readonly #toolbar: GenericToolbar<Tool>;
	readonly #palette: GroupedToolPalette<Tool>;
	readonly #fillOptions: HTMLElement;
	readonly #fillColor: HTMLInputElement;
	readonly #fillTolerance: HTMLInputElement;
	readonly #pickerOptions: HTMLElement;
	readonly #pickerSwatch: HTMLElement;
	readonly #sampledColor: HTMLInputElement;
	readonly #cropOptions: HTMLElement;
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
		const pickerControls = this.createPickerOptions();
		this.#pickerOptions = pickerControls.root;
		this.#pickerSwatch = pickerControls.swatch;
		this.#sampledColor = pickerControls.color;
		this.#cropOptions = this.createCropOptions();
		this.#contextHint = this.createContextHint();
		if (shapes)
			this.#selectedObjectProperties = new SelectedObjectPropertiesController(
				shapes,
				element('.tool-options', this.#toolsPanel),
			);
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
					tools: SHAPE_TOOL_DEFINITIONS,
					defaultTool: ShapeToolId.Rectangle,
				},
			],
			buttonContainer: element('.utility-tools'),
			buttonTools: [ERASER_TOOL_DEFINITION, ...UTILITY_TOOL_DEFINITIONS],
			defaultTool: PaintToolId.Brush,
			documentModel,
			stateKey: 'drawing',
			profiledControlIds: PROFILED_DRAWING_CONTROL_IDS,
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
					tools: SHAPE_TOOL_DEFINITIONS,
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
	get fillShape(): boolean {
		return this.#fill.checked;
	}
	get cropSelectionKind(): CropSelectionKind {
		return this.#cropSelectionKind;
	}

	onSelection(listener: (tool: Tool) => void): void {
		this.#toolbar.onSelection(listener);
	}

	fillOptions(): FloodFillOptions {
		return {
			color: this.#fillColor.value,
			opacity: Number(this.#opacity.value) / PERCENT_SCALE,
			tolerance: Math.min(
				COLOR_CHANNEL_MAXIMUM,
				Number(this.#fillTolerance.value),
			),
		};
	}

	showSampledColor(color: string): void {
		this.#sampledColor.value = color;
		this.updatePickerSwatch(color);
		this.#toolbar.persist();
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
			color: this.#color.value,
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
		this.#selectedObjectProperties?.setEnabled(
			behavior.optionSource === ToolOptionSource.Contextual,
		);
		element('.shape-option').classList.toggle('hidden', !options.shapeFill);
		this.#hardness
			.closest('label')!
			.classList.toggle('hidden', !options.hardness);
		this.#size.closest('label')!.classList.toggle('hidden', !options.size);
		if (behavior.sizeLabel) this.#sizeLabel.textContent = behavior.sizeLabel;
		this.#color.closest('label')!.classList.toggle('hidden', !options.color);
		this.#opacity
			.closest('label')!
			.classList.toggle('hidden', !options.opacity);
		this.#fillOptions.classList.toggle('hidden', !options.fill);
		this.#pickerOptions.classList.toggle('hidden', !options.picker);
		this.#cropOptions.classList.toggle('hidden', !options.crop);
		this.#contextHint.classList.toggle('hidden', !options.zoom);
		if (options.picker) this.updatePickerSwatch(this.#sampledColor.value);
	}

	private createFillOptions(): {
		root: HTMLElement;
		color: HTMLInputElement;
		tolerance: HTMLInputElement;
	} {
		const root = document.createElement('div');
		root.className = 'fill-tool-options hidden';
		root.innerHTML = `<label>Fill color <input id="fillColorInput" type="color" value="${ColorPalette.Black}"></label><label>Tolerance <span id="fillToleranceValue">32</span><input id="fillToleranceInput" type="range" min="0" max="255" value="32"></label>`;
		element('.tool-options', this.#toolsPanel).prepend(root);
		return {
			root,
			color: element<HTMLInputElement>('#fillColorInput', root),
			tolerance: element<HTMLInputElement>('#fillToleranceInput', root),
		};
	}

	private createPickerOptions(): {
		root: HTMLElement;
		swatch: HTMLElement;
		color: HTMLInputElement;
	} {
		const root = document.createElement('div');
		root.className = 'picker-tool-options hidden';
		root.innerHTML = `<input id="sampledColorInput" type="hidden" value="${ColorPalette.Black}"><p class="tool-hint">Click pixels repeatedly to sample colours without changing paint or fill.</p><div class="sampled-color"><span>Last sampled colour</span><i aria-hidden="true"></i><code>${ColorPalette.Black}</code></div><div class="context-actions"><button type="button" data-use-color="paint">Use for paint</button><button type="button" data-use-color="fill">Use for fill</button></div>`;
		root.addEventListener('click', (event) => {
			const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
				'[data-use-color]',
			);
			if (!target) return;
			if (target.dataset.useColor === 'paint')
				this.#color.value = this.#sampledColor.value;
			else this.#fillColor.value = this.#sampledColor.value;
			this.#toolbar.persist();
		});
		element('.tool-options', this.#toolsPanel).prepend(root);
		return {
			root,
			swatch: element<HTMLElement>('.sampled-color', root),
			color: element<HTMLInputElement>('#sampledColorInput', root),
		};
	}

	private createCropOptions(): HTMLElement {
		const root = document.createElement('div');
		root.className = 'crop-tool-options hidden';
		root.innerHTML = `<p class="tool-hint">Select an area, then drag inside it to move its pixels.</p>
			<div class="crop-selection-modes" role="group" aria-label="Crop selection mode">
				<button type="button" class="crop-mode-button active" data-crop-selection-kind="${CropSelectionKind.Rectangle}" aria-label="Rectangle crop selection" aria-pressed="true" title="Rectangle selection">
					<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1"/></svg><span>Rectangle</span>
				</button>
				<button type="button" class="crop-mode-button" data-crop-selection-kind="${CropSelectionKind.Lasso}" aria-label="Lasso crop selection" aria-pressed="false" title="Freehand lasso selection">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.5 11.5c0 4-3.2 7-7.2 7S4 15.8 4 11.5 7.2 5 11.3 5s7.2 2.5 7.2 6.5Z"/><path d="M11.3 18.5c1.8 0 3.2.8 3.2 2"/></svg><span>Lasso</span>
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
		const actions: ReadonlyArray<readonly [string, string, () => void]> = [
			['−', 'Zoom out', () => viewport.zoomOut()],
			['+', 'Zoom in', () => viewport.zoomIn()],
			['Fit', 'Fit image to window', () => viewport.fitToWindow()],
			['100%', 'Actual pixels', () => viewport.actualPixels()],
		];
		options.append(
			heading,
			...actions.map(([label, title, action]) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = label;
				button.title = title;
				button.addEventListener('click', action);
				return button;
			}),
		);
		this.#toolsPanel.querySelector('.panel-body')!.append(options);
		return options;
	}

	private updatePickerSwatch(color: string): void {
		element<HTMLElement>('i', this.#pickerSwatch).style.backgroundColor = color;
		element<HTMLElement>('code', this.#pickerSwatch).textContent =
			color.toUpperCase();
	}
}

function isCropSelectionKind(
	value: string | undefined,
): value is CropSelectionKind {
	return Object.values(CropSelectionKind).some((kind) => kind === value);
}
