import {
	canvasPoint,
	configureStroke,
	drawFreehandStroke,
	drawShape,
	type StrokeOptions,
} from './drawingHelpers';
import { floodFill } from './floodFillHelpers';
import { element } from '../../shared/dom/domHelpers';
import {
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
	type CropRect,
	type PaintTool,
	type Point,
	type ShapeTool,
	type Tool,
} from '../../core/document/appTypes';
import {
	BRUSH_TOOL_DEFINITIONS,
	DRAWING_TOOL_DEFINITIONS,
	ERASER_TOOL_DEFINITION,
	SHAPE_TOOL_DEFINITIONS,
	toolForShortcut,
	UTILITY_TOOL_DEFINITIONS,
} from './drawingToolCatalog';
import {
	DrawingToolKind,
	drawingToolBehavior,
	isToolKind,
} from './drawingToolBehavior';
import { CanvasDocument } from '../../core/document/imageDocument';
import { GenericToolbar } from '../workspace/genericToolbar';
import { GroupedToolPalette } from '../workspace/groupedToolPalette';
import {
	ZoomDirection,
	type CanvasViewportController,
} from '../workspace/canvasViewportController';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import type { ShapeHandle } from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import { ColorPalette } from '../../core/document/colorPalette';
import { normalizedRect } from '../../core/geometry/geometryHelpers';
import { ToolbarId, toolbarSelector } from '../workspace/toolbarTypes';

const PERCENT_SCALE = 100;
const COLOR_CHANNEL_MAXIMUM = 255;
const HEX_RADIX = 16;
const HEX_CHANNEL_WIDTH = 2;
const POINTER_NUDGE = 0.01;
const POINTER_DRAG_THRESHOLD = 3;
const MINIMUM_SHAPE_LENGTH = 2;

export class DrawingController {
	readonly #toolsPanel = element<HTMLElement>(toolbarSelector(ToolbarId.Tools));
	readonly #canvasWrap = element<HTMLElement>('#canvasWrap');
	readonly #color = element<HTMLInputElement>('#colorInput');
	readonly #size = element<HTMLInputElement>('#sizeInput');
	readonly #opacity = element<HTMLInputElement>('#opacityInput');
	readonly #hardness = element<HTMLInputElement>('#hardnessInput');
	readonly #fill = element<HTMLInputElement>('#fillInput');
	readonly #applyCrop = element<HTMLButtonElement>('#applyCropButton');
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
	readonly #contextHint: HTMLElement;
	#tool: Tool = PaintToolId.Brush;
	#drawing = false;
	#start: Point = { x: 0, y: 0 };
	#last: Point = { x: 0, y: 0 };
	#crop: CropRect | null = null;
	#restoredColor = false;
	#activeStrokeOptions: StrokeOptions | null = null;
	#lockedScroll: Point | null = null;
	#shapeId: string | null = null;
	#shapeHandle: ShapeHandle | null = null;
	#pendingShapeSelectionId: string | null = null;
	#interactionsActive = true;
	readonly #interactionListeners = new Set<() => void>();

	constructor(
		readonly documentModel: CanvasDocument,
		readonly viewport?: CanvasViewportController,
		readonly shapes?: AnnotationDocument,
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
		this.#restoredColor = this.#toolbar.restoredControlIds.has('colorInput');
		this.syncRangeLabels();
		this.#toolbar.onSelection((tool) => {
			this.#interactionsActive = true;
			this.#interactionListeners.forEach((listener) => listener());
			this.#palette.update(tool);
			this.activateTool(tool);
		});
		this.bindEvents();
		this.activateTool(this.#toolbar.activeTool);
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

	onInteractionRequested(listener: () => void): void {
		this.#interactionListeners.add(listener);
	}

	suspendInteractions(): void {
		this.#interactionsActive = false;
		this.#drawing = false;
		this.restoreLockedScroll();
		this.#lockedScroll = null;
		this.#activeStrokeOptions = null;
		this.#shapeId = null;
		this.#shapeHandle = null;
		this.#pendingShapeSelectionId = null;
	}

	private activateTool(tool: Tool): void {
		const changed = tool !== this.#tool;
		this.#tool = tool;
		if (changed && tool !== UtilityToolId.Select) this.shapes?.select(null);
		this.documentModel.overlay.classList.toggle(
			'fill-cursor',
			tool === UtilityToolId.Fill,
		);
		this.documentModel.overlay.style.cursor = cursorForTool(tool);
		this.updateToolOptions();
		this.syncRangeLabels();
		if (tool !== UtilityToolId.Crop) {
			this.#crop = null;
			this.#applyCrop.classList.add('hidden');
			this.documentModel.clearOverlay();
		}
	}

	selectFromShortcut(key: string): boolean {
		const tool = toolForShortcut(key);
		if (!tool) return false;
		this.select(tool);
		return true;
	}

	private bindEvents(): void {
		const overlay = this.documentModel.overlay;
		overlay.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			this.onPointerDown(event);
		});
		overlay.addEventListener('pointermove', (event) => {
			this.updateZoomCursor(event.altKey);
			this.onPointerMove(event);
		});
		overlay.addEventListener('pointerenter', (event) =>
			this.updateZoomCursor(event.altKey),
		);
		overlay.addEventListener('pointerup', (event) => this.onPointerUp(event));
		overlay.addEventListener('pointercancel', (event) =>
			this.onPointerUp(event),
		);
		overlay.addEventListener('pointerleave', () => {
			if (!this.#drawing) this.restoreDrawingCursor();
		});
		document.addEventListener('keydown', (event) =>
			this.updateZoomCursor(event.altKey),
		);
		document.addEventListener('keyup', (event) =>
			this.updateZoomCursor(event.altKey),
		);
		window.addEventListener('blur', () => this.updateZoomCursor(false));
		this.#applyCrop.addEventListener('click', () => {
			if (!this.#crop) return;
			this.documentModel.crop(this.#crop);
			this.#crop = null;
			this.#applyCrop.classList.add('hidden');
		});
		this.bindRange(this.#size, '#sizeValue', (value) => `${value} px`);
		this.bindRange(this.#opacity, '#opacityValue', (value) => `${value}%`);
		this.bindRange(this.#hardness, '#hardnessValue', (value) => `${value}%`);
		this.bindRange(
			this.#fillTolerance,
			'#fillToleranceValue',
			(value) => value,
		);
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

	private updateToolOptions(): void {
		const options = drawingToolBehavior(this.#tool).options;
		element('.shape-option').classList.toggle('hidden', !options.shapeFill);
		this.#hardness
			.closest('label')!
			.classList.toggle('hidden', !options.hardness);
		this.#size.closest('label')!.classList.toggle('hidden', !options.size);
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
		root.innerHTML =
			'<p class="tool-hint">Drag over the image to define the crop area.</p><div class="context-actions"><button type="button" data-cancel-crop>Cancel</button></div>';
		root.append(this.#applyCrop);
		element<HTMLButtonElement>('[data-cancel-crop]', root).addEventListener(
			'click',
			() => {
				this.#crop = null;
				this.#applyCrop.classList.add('hidden');
				this.documentModel.clearOverlay();
			},
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

	private point(event: PointerEvent): Point {
		return canvasPoint(
			event,
			this.documentModel.overlay.getBoundingClientRect(),
			this.documentModel.width,
			this.documentModel.height,
		);
	}

	private updateZoomCursor(zoomOut: boolean): void {
		if (this.#tool === UtilityToolId.Zoom)
			this.documentModel.overlay.style.cursor = zoomOut
				? 'zoom-out'
				: 'zoom-in';
	}

	private strokeOptions(): StrokeOptions {
		return {
			color: this.#color.value,
			size: Number(this.#size.value),
			opacity: Number(this.#opacity.value) / PERCENT_SCALE,
			hardness: Number(this.#hardness.value) / PERCENT_SCALE,
		};
	}

	private renderShape(
		context: CanvasRenderingContext2D,
		from: Point,
		to: Point,
	): void {
		context.save();
		configureStroke(context, this.strokeOptions());
		drawShape(context, this.#tool, from, to, this.#fill.checked);
		context.restore();
	}

	private onPointerDown(event: PointerEvent): void {
		if (!this.#interactionsActive || !this.documentModel.hasImage) return;
		this.updateZoomCursor(event.altKey);
		const point = this.point(event);
		if (this.beginShapeInteraction(point, event)) return;
		if (this.runImmediateTool(point, event)) return;
		this.beginDrawing(point, event);
	}

	private beginShapeInteraction(point: Point, event: PointerEvent): boolean {
		if (
			(!isToolKind(this.#tool, DrawingToolKind.Shape) &&
				!isToolKind(this.#tool, DrawingToolKind.Select)) ||
			!this.shapes
		)
			return false;
		const selected = this.selectedShape();
		const handle = selected ? genericShape(selected).hitHandle(point) : null;
		if (selected && handle) {
			this.#drawing = true;
			this.#shapeId = selected.id;
			this.#shapeHandle = handle;
			this.#start = this.#last = point;
			this.documentModel.overlay.setPointerCapture(event.pointerId);
			return true;
		}
		const hit = this.shapes.hitTest(point);
		if (hit?.type === AnnotationObjectTypeId.Shape) {
			if (hit.id === selected?.id || this.#tool === UtilityToolId.Select) {
				this.shapes.select(hit.id);
				this.#shapeId = hit.id;
			} else this.#pendingShapeSelectionId = hit.id;
			this.#drawing = true;
			this.#start = this.#last = point;
			this.documentModel.overlay.setPointerCapture(event.pointerId);
			return true;
		}
		if (this.#tool !== UtilityToolId.Select) return false;
		this.shapes.select(null);
		return true;
	}

	private runImmediateTool(point: Point, event: PointerEvent): boolean {
		if (this.#tool === UtilityToolId.Picker) {
			this.sampleColor(point);
			return true;
		}
		if (this.#tool === UtilityToolId.Zoom) {
			this.viewport?.zoomAt(
				event.clientX,
				event.clientY,
				event.altKey ? ZoomDirection.Out : ZoomDirection.In,
			);
			return true;
		}
		if (this.#tool === UtilityToolId.Fill) {
			this.fillAt(point);
			return true;
		}
		return false;
	}

	private sampleColor(point: Point): void {
		const x = Math.max(
			0,
			Math.min(this.documentModel.width - 1, Math.floor(point.x)),
		);
		const y = Math.max(
			0,
			Math.min(this.documentModel.height - 1, Math.floor(point.y)),
		);
		const pixel = this.documentModel.context.getImageData(x, y, 1, 1).data;
		this.#sampledColor.value = `#${[pixel[0], pixel[1], pixel[2]].map((value) => value!.toString(HEX_RADIX).padStart(HEX_CHANNEL_WIDTH, '0')).join('')}`;
		this.updatePickerSwatch(this.#sampledColor.value);
		this.#toolbar.persist();
	}

	private fillAt(point: Point): void {
		const x = Math.max(
			0,
			Math.min(this.documentModel.width - 1, Math.floor(point.x)),
		);
		const y = Math.max(
			0,
			Math.min(this.documentModel.height - 1, Math.floor(point.y)),
		);
		const changed = floodFill(
			this.documentModel.context,
			this.documentModel.width,
			this.documentModel.height,
			x,
			y,
			{
				color: this.#fillColor.value,
				opacity: Number(this.#opacity.value) / PERCENT_SCALE,
				tolerance: Math.min(
					COLOR_CHANNEL_MAXIMUM,
					Number(this.#fillTolerance.value),
				),
			},
		);
		if (changed) this.documentModel.commit();
	}

	private beginDrawing(point: Point, event: PointerEvent): void {
		this.#drawing = true;
		this.#start = this.#last = point;
		this.#lockedScroll = {
			x: this.#canvasWrap.scrollLeft,
			y: this.#canvasWrap.scrollTop,
		};
		this.#activeStrokeOptions = this.strokeOptions();
		this.documentModel.overlay.setPointerCapture(event.pointerId);
		if (isPaintTool(this.#tool))
			this.paint(
				point,
				{ x: point.x + POINTER_NUDGE, y: point.y + POINTER_NUDGE },
				event.pressure,
			);
	}

	private onPointerMove(event: PointerEvent): void {
		if (!this.#drawing) {
			this.updateShapeCursor(this.point(event));
			return;
		}
		event.preventDefault();
		this.restoreLockedScroll();
		const point = this.point(event);
		if (this.isPendingSelectionClick(point)) return;
		if (this.#shapeId && this.shapes) {
			this.updateShapeInteraction(point);
		} else if (isPaintTool(this.#tool)) {
			this.continuePaintStroke(event, point);
		} else {
			this.documentModel.clearOverlay();
			this.renderShape(this.documentModel.overlayContext, this.#start, point);
		}
	}

	private isPendingSelectionClick(point: Point): boolean {
		if (!this.#pendingShapeSelectionId) return false;
		const remainsClick =
			Math.hypot(point.x - this.#start.x, point.y - this.#start.y) <
			POINTER_DRAG_THRESHOLD;
		if (!remainsClick) this.#pendingShapeSelectionId = null;
		return remainsClick;
	}

	private updateShapeInteraction(point: Point): void {
		if (!this.shapes || !this.#shapeId) return;
		if (this.#shapeHandle)
			this.shapes.transformSelected(this.#shapeHandle, point, false);
		else
			this.shapes.move(
				this.#shapeId,
				{ x: point.x - this.#last.x, y: point.y - this.#last.y },
				false,
			);
		this.#last = point;
	}

	private continuePaintStroke(event: PointerEvent, point: Point): void {
		const samples = event.getCoalescedEvents?.() ?? [];
		for (const sample of samples) {
			const sampledPoint = this.point(sample);
			this.paint(this.#last, sampledPoint, sample.pressure);
			this.#last = sampledPoint;
		}
		const lastSample = samples.at(-1);
		if (
			lastSample?.clientX === event.clientX &&
			lastSample.clientY === event.clientY
		)
			return;
		this.paint(this.#last, point, event.pressure);
		this.#last = point;
	}

	private onPointerUp(event: PointerEvent): void {
		if (!this.#drawing) return;
		this.restoreLockedScroll();
		this.#drawing = false;
		this.#activeStrokeOptions ??= this.strokeOptions();
		const point = this.point(event);
		if (this.#pendingShapeSelectionId && this.shapes) {
			this.shapes.select(this.#pendingShapeSelectionId);
		} else if (this.#shapeId && this.shapes) {
			this.shapes.commitCurrent();
		} else if (isToolKind(this.#tool, DrawingToolKind.Shape)) {
			this.documentModel.clearOverlay();
			if (this.shapes) {
				const rect = normalizedRect(this.#start, point);
				if (
					Math.hypot(point.x - this.#start.x, point.y - this.#start.y) >=
					MINIMUM_SHAPE_LENGTH
				)
					this.shapes.add({
						id: crypto.randomUUID(),
						type: AnnotationObjectTypeId.Shape,
						shape: this.#tool as ShapeTool,
						rect,
						rotation: 0,
						color: this.#color.value,
						width: Number(this.#size.value),
						opacity: Number(this.#opacity.value) / PERCENT_SCALE,
						fill: this.#fill.checked,
					});
			} else {
				this.renderShape(this.documentModel.context, this.#start, point);
				this.documentModel.commit();
			}
		} else if (this.#tool === UtilityToolId.Crop) {
			this.#crop = {
				x: Math.round(Math.min(this.#start.x, point.x)),
				y: Math.round(Math.min(this.#start.y, point.y)),
				width: Math.round(Math.abs(point.x - this.#start.x)),
				height: Math.round(Math.abs(point.y - this.#start.y)),
			};
			this.#applyCrop.classList.toggle(
				'hidden',
				this.#crop.width < 1 || this.#crop.height < 1,
			);
		} else this.documentModel.commit();
		this.#activeStrokeOptions = null;
		this.#lockedScroll = null;
		this.#shapeId = null;
		this.#shapeHandle = null;
		this.#pendingShapeSelectionId = null;
	}

	private restoreLockedScroll(): void {
		if (!this.#lockedScroll) return;
		this.#canvasWrap.scrollLeft = this.#lockedScroll.x;
		this.#canvasWrap.scrollTop = this.#lockedScroll.y;
	}

	private paint(from: Point, to: Point, pressure: number): void {
		drawFreehandStroke(
			this.documentModel.context,
			this.#tool as PaintTool,
			from,
			to,
			this.#activeStrokeOptions ?? this.strokeOptions(),
			pressure || 1,
		);
	}

	private updatePickerSwatch(color: string): void {
		element<HTMLElement>('i', this.#pickerSwatch).style.backgroundColor = color;
		element<HTMLElement>('code', this.#pickerSwatch).textContent =
			color.toUpperCase();
	}

	private selectedShape(): ShapeAnnotation | null {
		const selected = this.shapes?.selected;
		return selected?.type === AnnotationObjectTypeId.Shape ? selected : null;
	}

	private updateShapeCursor(point: Point): void {
		if (
			!this.shapes ||
			(!isToolKind(this.#tool, DrawingToolKind.Shape) &&
				!isToolKind(this.#tool, DrawingToolKind.Select))
		)
			return;
		const selected = this.selectedShape();
		const selectedCursor = selected
			? genericShape(selected).cursorAt(point)
			: null;
		if (selectedCursor) {
			this.documentModel.overlay.style.cursor = selectedCursor;
			return;
		}
		if (this.#tool === UtilityToolId.Select) {
			const hit = this.shapes.hitTest(point);
			this.documentModel.overlay.style.cursor =
				hit?.type === AnnotationObjectTypeId.Shape ? 'move' : 'default';
		} else this.restoreDrawingCursor();
	}

	private restoreDrawingCursor(): void {
		this.documentModel.overlay.style.cursor = cursorForTool(this.#tool);
	}
}

function isPaintTool(tool: Tool): tool is PaintTool {
	return isToolKind(tool, DrawingToolKind.Paint);
}
function cursorForTool(tool: Tool): string {
	return drawingToolBehavior(tool).cursor;
}
