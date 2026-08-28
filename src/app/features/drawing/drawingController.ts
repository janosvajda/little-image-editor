import {
	type CropRect,
	type PaintTool,
	PaintToolId,
	type Point,
	type ShapeTool,
	ShapeToolId,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { normalizedRect } from '../../core/geometry/geometryHelpers';
import type { ShapeHandle } from '../../core/geometry/shapeTransformHelpers';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { element } from '../../shared/dom/domHelpers';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type ShapeAnnotation,
	type StrokeAnnotation,
	type StrokePoint,
} from '../annotations/annotationTypes';
import {
	materializeStrokeTransform,
	strokePointBounds,
	transformedStrokePoints,
} from '../annotations/strokeGeometry';
import {
	type CanvasViewportController,
	ZoomDirection,
} from '../workspace/canvasViewportController';
import { GenericToolbar } from '../workspace/genericToolbar';
import { GroupedToolPalette } from '../workspace/groupedToolPalette';
import { ToolbarId, toolbarSelector } from '../workspace/toolbarTypes';
import {
	canvasPoint,
	configureStroke,
	drawFreehandStroke,
	drawShape,
	type StrokeOptions,
} from './drawingHelpers';
import {
	DrawingToolKind,
	drawingToolBehavior,
	isToolKind,
} from './drawingToolBehavior';
import {
	BRUSH_TOOL_DEFINITIONS,
	DRAWING_TOOL_DEFINITIONS,
	ERASER_TOOL_DEFINITION,
	SHAPE_TOOL_DEFINITIONS,
	toolForShortcut,
	UTILITY_TOOL_DEFINITIONS,
} from './drawingToolCatalog';
import {
	createFloodFillMask,
	floodFill,
	type FloodFillRun,
} from './floodFillHelpers';
import { SelectedObjectPropertiesController } from './selectedObjectPropertiesController';

const PERCENT_SCALE = 100;
const COLOR_CHANNEL_MAXIMUM = 255;
const HEX_RADIX = 16;
const HEX_CHANNEL_WIDTH = 2;
const POINTER_NUDGE = 0.01;
const POINTER_DRAG_THRESHOLD = 3;
const MINIMUM_SHAPE_LENGTH = 2;
const STROKE_ENDPOINT_HIT_TOLERANCE = 12;
const DOUBLE_CLICK_GESTURE_TIMEOUT_MS = 500;

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
	#strokeId: string | null = null;
	#shapeHandle: ShapeHandle | null = null;
	#pendingShapeSelectionId: string | null = null;
	#pendingBodyMoveId: string | null = null;
	#pendingStrokeContinuationId: string | null = null;
	#pendingHandleInteraction = false;
	#paintStrokeDragged = false;
	readonly #pendingClickStrokeIds = new Set<string>();
	#pendingClickCommitTimer: number | null = null;
	#continuationStrokeId: string | null = null;
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
		if (shapes)
			new SelectedObjectPropertiesController(
				shapes,
				element('.tool-options', this.#toolsPanel),
				() => this.prepareSelectedStrokeContinuation(),
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
		this.activateTool(this.#toolbar.activeTool, false);
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

	editObject(objectId: string): void {
		const object = this.shapes?.object(objectId);
		if (!object || !this.shapes?.isEditable(objectId)) return;
		this.shapes.select(objectId);
		if (object.type === AnnotationObjectTypeId.Stroke) {
			this.activateStrokeEditing(object);
			return;
		}
		this.#toolbar.select(UtilityToolId.Select);
		this.shapes.select(objectId);
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
		this.#strokeId = null;
		this.#shapeHandle = null;
		this.#pendingShapeSelectionId = null;
		this.#pendingBodyMoveId = null;
		this.#pendingStrokeContinuationId = null;
		this.#pendingHandleInteraction = false;
		this.#continuationStrokeId = null;
	}

	private activateTool(tool: Tool, clearSelection = true): void {
		this.#tool = tool;
		if (clearSelection && tool !== UtilityToolId.Select) this.shapes?.select(null);
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
		overlay.addEventListener('dblclick', (event) => {
			event.preventDefault();
			this.editPaintObjectAt(this.point(event));
		});
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

	private point(event: MouseEvent): Point {
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
		if (
			!this.#interactionsActive ||
			!this.documentModel.hasImage ||
			!this.documentModel.layers.isEditable(CoreLayerId.Objects)
		)
			return;
		this.updateZoomCursor(event.altKey);
		const point = this.point(event);
		if (this.beginShapeInteraction(point, event)) return;
		if (this.runImmediateTool(point, event)) return;
		this.beginDrawing(point, event);
	}

	private beginShapeInteraction(point: Point, event: PointerEvent): boolean {
		if (!this.shapes) return false;
		if (this.beginStrokeContinuation(point, event)) return true;
		if (this.beginSelectedInteraction(point, event)) return true;
		if (
			!isToolKind(this.#tool, DrawingToolKind.Shape) &&
			!isToolKind(this.#tool, DrawingToolKind.Select)
		)
			return false;
		const selected = this.selectedObject();
		const hit = this.shapes.hitTest(point);
		const selectableHit =
			this.#tool === UtilityToolId.Select
				? hit
				: hit?.type === AnnotationObjectTypeId.Shape
					? hit
					: null;
		if (selectableHit) {
			if (
				selectableHit.id === selected?.id ||
				this.#tool === UtilityToolId.Select
			) {
				this.shapes.select(selectableHit.id);
				this.#shapeId = selectableHit.id;
				this.shapes.beginInteraction(selectableHit.id);
			} else this.#pendingShapeSelectionId = selectableHit.id;
			this.#drawing = true;
			this.#start = this.#last = point;
			this.documentModel.overlay.setPointerCapture(event.pointerId);
			return true;
		}
		if (this.#tool !== UtilityToolId.Select) return false;
		this.shapes.select(null);
		return true;
	}

	private beginSelectedInteraction(
		point: Point,
		event: PointerEvent,
	): boolean {
		return (
			this.beginSelectedHandleInteraction(point, event) ||
			this.beginSelectedMoveHandleInteraction(point, event) ||
			this.beginSelectedBodyInteraction(point, event)
		);
	}

	private beginSelectedBodyInteraction(
		point: Point,
		event: PointerEvent,
	): boolean {
		if (this.#tool !== UtilityToolId.Select) return false;
		const selected = this.shapes?.selected;
		if (
			!selected ||
			!this.shapes?.isEditable(selected.id) ||
			!genericShape(selected).contains(point)
		)
			return false;
		this.#drawing = true;
		this.#pendingBodyMoveId = selected.id;
		this.shapes.beginInteraction(selected.id);
		this.#start = this.#last = point;
		this.documentModel.overlay.setPointerCapture(event.pointerId);
		return true;
	}

	private beginSelectedMoveHandleInteraction(
		point: Point,
		event: PointerEvent,
	): boolean {
		const selected = this.shapes?.selected;
		if (
			!selected ||
			!this.shapes?.isEditable(selected.id) ||
			!genericShape(selected).hitMoveHandle(point, this.visualScale())
		)
			return false;
		this.#drawing = true;
		this.#pendingBodyMoveId = selected.id;
		this.shapes.beginInteraction(selected.id);
		this.#start = this.#last = point;
		this.documentModel.overlay.setPointerCapture(event.pointerId);
		return true;
	}

	private beginSelectedHandleInteraction(
		point: Point,
		event: PointerEvent,
	): boolean {
		const selected = this.shapes?.selected;
		if (!selected || !this.shapes?.isEditable(selected.id)) return false;
		const handle = genericShape(selected).hitHandle(point, this.visualScale());
		if (!handle) return false;
		this.#drawing = true;
		this.#shapeId = selected.id;
		this.#shapeHandle = handle;
		this.#pendingHandleInteraction = true;
		this.shapes.beginInteraction(selected.id);
		this.#start = this.#last = point;
		this.documentModel.overlay.setPointerCapture(event.pointerId);
		return true;
	}

	private prepareSelectedStrokeContinuation(): void {
		const selected = this.shapes?.selected;
		if (!selected || selected.type !== AnnotationObjectTypeId.Stroke) return;
		this.activateStrokeEditing(selected);
	}

	private activateStrokeEditing(stroke: StrokeAnnotation): void {
		this.#toolbar.select(UtilityToolId.Select);
		this.shapes?.select(stroke.id);
		this.#continuationStrokeId = stroke.id;
		this.documentModel.overlay.style.cursor = 'move';
	}

	private editPaintObjectAt(point: Point): void {
		const object = this.shapes?.hitTest(point, this.#pendingClickStrokeIds);
		if (
			!object ||
			object.type !== AnnotationObjectTypeId.Stroke ||
			!this.shapes?.isEditable(object.id)
		)
			return;
		this.discardPendingClickStrokes();
		this.editObject(object.id);
	}

	private beginStrokeContinuation(point: Point, event: PointerEvent): boolean {
		if (!this.shapes || !this.#continuationStrokeId) return false;
		const stroke = this.shapes.object(this.#continuationStrokeId);
		if (
			!stroke ||
			stroke.type !== AnnotationObjectTypeId.Stroke ||
			!this.shapes.isEditable(stroke.id)
		) {
			this.#continuationStrokeId = null;
			return false;
		}
		if (!this.isContinuationEndpoint(stroke, point)) return false;
		this.#drawing = true;
		this.#pendingStrokeContinuationId = stroke.id;
		this.#start = this.#last = point;
		this.documentModel.overlay.setPointerCapture(event.pointerId);
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
		const options = {
			color: this.#fillColor.value,
			opacity: Number(this.#opacity.value) / PERCENT_SCALE,
			tolerance: Math.min(
				COLOR_CHANNEL_MAXIMUM,
				Number(this.#fillTolerance.value),
			),
		};
		if (this.shapes) {
			const composite = this.documentModel.compositeCanvas();
			const runs = createFloodFillMask(
				composite.getContext('2d')!,
				this.documentModel.width,
				this.documentModel.height,
				x,
				y,
				options,
			);
			if (runs.length === 0) return;
			this.shapes.add({
				id: crypto.randomUUID(),
				type: AnnotationObjectTypeId.Fill,
				layerId: CoreLayerId.Objects,
				rect: fillBounds(runs),
				runs: [...runs],
				color: options.color,
				opacity: options.opacity,
				tolerance: options.tolerance,
				rotation: 0,
			});
			return;
		}
		const changed = floodFill(
			this.documentModel.context,
			this.documentModel.width,
			this.documentModel.height,
			x,
			y,
			options,
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
		if (isPaintTool(this.#tool)) {
			this.#paintStrokeDragged = false;
			this.beginRetainedStroke(point, event.pressure);
		}
	}

	private onPointerMove(event: PointerEvent): void {
		if (!this.#drawing) {
			this.updateShapeCursor(this.point(event));
			return;
		}
		event.preventDefault();
		this.restoreLockedScroll();
		const point = this.point(event);
		if (this.isPendingClick(point)) return;
		if (this.#shapeId && this.shapes) {
			this.updateShapeInteraction(point);
		} else if (this.#strokeId || isPaintTool(this.#tool)) {
			this.continuePaintStroke(event, point);
		} else {
			this.documentModel.clearOverlay();
			this.renderShape(this.documentModel.overlayContext, this.#start, point);
		}
	}

	private isPendingClick(point: Point): boolean {
		if (
			!this.#pendingShapeSelectionId &&
			!this.#pendingBodyMoveId &&
			!this.#pendingStrokeContinuationId &&
			!this.#pendingHandleInteraction
		)
			return false;
		const remainsClick =
			Math.hypot(point.x - this.#start.x, point.y - this.#start.y) <
			POINTER_DRAG_THRESHOLD;
		if (remainsClick) {
			this.previewPendingBodyMove(point);
			return true;
		}
		if (this.#pendingBodyMoveId) {
			this.#shapeId = this.#pendingBodyMoveId;
			this.#pendingBodyMoveId = null;
		}
		if (this.#pendingStrokeContinuationId)
			this.startPendingStrokeContinuation();
		if (this.#pendingHandleInteraction) {
			this.#pendingHandleInteraction = false;
			this.#last = this.#start;
		}
		this.#pendingShapeSelectionId = null;
		return remainsClick;
	}

	private previewPendingBodyMove(point: Point): void {
		if (!this.shapes || !this.#pendingBodyMoveId) return;
		this.shapes.move(
			this.#pendingBodyMoveId,
			{ x: point.x - this.#last.x, y: point.y - this.#last.y },
			false,
		);
		this.#last = point;
	}

	private restorePendingBodyPreview(): void {
		if (!this.shapes || !this.#pendingBodyMoveId) return;
		this.shapes.move(
			this.#pendingBodyMoveId,
			{ x: this.#start.x - this.#last.x, y: this.#start.y - this.#last.y },
			false,
		);
	}

	private startPendingStrokeContinuation(): void {
		if (!this.shapes || !this.#pendingStrokeContinuationId) return;
		const stroke = this.shapes.object(this.#pendingStrokeContinuationId);
		this.#pendingStrokeContinuationId = null;
		if (stroke?.type !== AnnotationObjectTypeId.Stroke) return;
		this.shapes.update(
			stroke.id,
			(object) => {
				if (object.type === AnnotationObjectTypeId.Stroke)
					materializeStrokeTransform(object, this.#start);
			},
			false,
		);
		this.#strokeId = stroke.id;
		this.#activeStrokeOptions = {
			color: stroke.color,
			size: stroke.size,
			opacity: stroke.opacity,
			hardness: stroke.hardness,
		};
		this.#continuationStrokeId = null;
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
		if (
			Math.hypot(point.x - this.#start.x, point.y - this.#start.y) >=
			POINTER_DRAG_THRESHOLD
		)
			this.#paintStrokeDragged = true;
		const samples = event.getCoalescedEvents?.() ?? [];
		for (const sample of samples) {
			const sampledPoint = this.point(sample);
			this.appendStrokePoint(sampledPoint, sample.pressure);
			this.#last = sampledPoint;
		}
		const lastSample = samples.at(-1);
		if (
			lastSample?.clientX === event.clientX &&
			lastSample.clientY === event.clientY
		)
			return;
		this.appendStrokePoint(point, event.pressure);
		this.#last = point;
	}

	private onPointerUp(event: PointerEvent): void {
		if (!this.#drawing) return;
		this.restoreLockedScroll();
		this.#drawing = false;
		this.#activeStrokeOptions ??= this.strokeOptions();
		const point = this.point(event);
		this.restorePendingBodyPreview();
		if (this.#pendingBodyMoveId || this.#pendingHandleInteraction)
			this.shapes?.cancelCurrentInteraction();
		if (this.#pendingShapeSelectionId && this.shapes) {
			this.shapes.select(this.#pendingShapeSelectionId);
		} else if (
			!this.#pendingBodyMoveId &&
			!this.#pendingStrokeContinuationId &&
			!this.#pendingHandleInteraction
		) {
			if (this.#shapeId && this.shapes) this.shapes.commitCurrent();
			else this.completeNewAction(point);
		}
		this.#activeStrokeOptions = null;
		this.#lockedScroll = null;
		this.#shapeId = null;
		this.#strokeId = null;
		this.#shapeHandle = null;
		this.#pendingShapeSelectionId = null;
		this.#pendingBodyMoveId = null;
		this.#pendingStrokeContinuationId = null;
		this.#pendingHandleInteraction = false;
		this.#continuationStrokeId = null;
	}

	private completeNewAction(point: Point): void {
		if (isToolKind(this.#tool, DrawingToolKind.Shape)) {
			this.completeShape(point);
			return;
		}
		if (this.#strokeId && this.shapes) {
			if (this.#paintStrokeDragged) this.shapes.commitCurrent();
			else this.scheduleClickStrokeCommit(this.#strokeId);
			return;
		}
		if (this.#tool === UtilityToolId.Crop) {
			this.completeCrop(point);
			return;
		}
		this.documentModel.commit();
	}

	private scheduleClickStrokeCommit(strokeId: string): void {
		this.#pendingClickStrokeIds.add(strokeId);
		if (this.#pendingClickCommitTimer !== null)
			window.clearTimeout(this.#pendingClickCommitTimer);
		this.#pendingClickCommitTimer = window.setTimeout(() => {
			this.#pendingClickCommitTimer = null;
			this.#pendingClickStrokeIds.clear();
			this.shapes?.commitCurrent();
		}, DOUBLE_CLICK_GESTURE_TIMEOUT_MS);
	}

	private discardPendingClickStrokes(): void {
		if (this.#pendingClickCommitTimer !== null)
			window.clearTimeout(this.#pendingClickCommitTimer);
		this.#pendingClickCommitTimer = null;
		this.shapes?.discardUncommitted(this.#pendingClickStrokeIds);
		this.#pendingClickStrokeIds.clear();
	}

	private completeShape(point: Point): void {
		this.documentModel.clearOverlay();
		if (!this.shapes) {
			this.renderShape(this.documentModel.context, this.#start, point);
			this.documentModel.commit();
			return;
		}
		if (
			Math.hypot(point.x - this.#start.x, point.y - this.#start.y) <
			MINIMUM_SHAPE_LENGTH
		)
			return;
		this.shapes.add({
			id: crypto.randomUUID(),
			type: AnnotationObjectTypeId.Shape,
			shape: this.#tool as ShapeTool,
			rect: normalizedRect(this.#start, point),
			rotation: 0,
			color: this.#color.value,
			width: Number(this.#size.value),
			opacity: Number(this.#opacity.value) / PERCENT_SCALE,
			fill: this.#fill.checked,
		});
	}

	private completeCrop(point: Point): void {
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
	}

	private restoreLockedScroll(): void {
		if (!this.#lockedScroll) return;
		this.#canvasWrap.scrollLeft = this.#lockedScroll.x;
		this.#canvasWrap.scrollTop = this.#lockedScroll.y;
	}

	private beginRetainedStroke(point: Point, pressure: number): void {
		if (!this.shapes || !isPaintTool(this.#tool)) return;
		const options = this.#activeStrokeOptions ?? this.strokeOptions();
		const first = strokePoint(point, pressure);
		const second = strokePoint(
			{ x: point.x + POINTER_NUDGE, y: point.y + POINTER_NUDGE },
			pressure,
		);
		const stroke: StrokeAnnotation = {
			id: crypto.randomUUID(),
			type: AnnotationObjectTypeId.Stroke,
			layerId: CoreLayerId.Objects,
			tool: this.#tool,
			points: [first, second],
			rect: strokePointBounds([first, second], options.size),
			color: options.color,
			size: options.size,
			opacity: options.opacity,
			hardness: options.hardness,
			seed: randomSeed(),
			rotation: 0,
		};
		stroke.sourceRect = { ...stroke.rect };
		this.#strokeId = stroke.id;
		this.shapes.add(stroke, false);
	}

	private appendStrokePoint(point: Point, pressure: number): void {
		if (!this.shapes || !this.#strokeId) return;
		this.shapes.update(
			this.#strokeId,
			(object) => {
				if (object.type !== AnnotationObjectTypeId.Stroke) return;
				const nextPoint = strokePoint(point, pressure);
				object.points.push(nextPoint);
				const sourceRect = expandedStrokeBounds(
					object.sourceRect ?? object.rect,
					nextPoint,
					object.size,
				);
				object.sourceRect = sourceRect;
				object.rect = { ...sourceRect };
			},
			false,
		);
	}

	private updatePickerSwatch(color: string): void {
		element<HTMLElement>('i', this.#pickerSwatch).style.backgroundColor = color;
		element<HTMLElement>('code', this.#pickerSwatch).textContent =
			color.toUpperCase();
	}

	private selectedObject(): AnnotationObject | null {
		const selected = this.shapes?.selected;
		if (!selected) return null;
		if (this.#tool === UtilityToolId.Select) return selected;
		return selected.type === AnnotationObjectTypeId.Shape ? selected : null;
	}

	private updateShapeCursor(point: Point): void {
		if (!this.shapes) return;
		const continuation = this.shapes.object(this.#continuationStrokeId);
		if (
			continuation?.type === AnnotationObjectTypeId.Stroke &&
			this.isContinuationEndpoint(continuation, point)
		) {
			this.documentModel.overlay.style.cursor = 'crosshair';
			return;
		}
		const transformCursor = this.selectedTransformCursor(point);
		if (transformCursor) {
			this.documentModel.overlay.style.cursor = transformCursor;
			return;
		}
		if (
			!isToolKind(this.#tool, DrawingToolKind.Shape) &&
			!isToolKind(this.#tool, DrawingToolKind.Select)
		) {
			this.restoreDrawingCursor();
			return;
		}
		const selected = this.selectedObject();
		const selectedCursor = selected
			? genericShape(selected).cursorAt(point, this.visualScale())
			: null;
		if (selectedCursor) {
			this.documentModel.overlay.style.cursor = selectedCursor;
			return;
		}
		if (this.#tool === UtilityToolId.Select) {
			const hit = this.shapes.hitTest(point);
			this.documentModel.overlay.style.cursor = hit ? 'move' : 'default';
		} else this.restoreDrawingCursor();
	}

	private selectedTransformCursor(point: Point): string | null {
		const selected = this.shapes?.selected;
		if (!selected || !this.shapes?.isEditable(selected.id)) return null;
		const shape = genericShape(selected);
		const visualScale = this.visualScale();
		return (
			shape.handleCursorAt(point, visualScale) ??
			(shape.hitMoveHandle(point, visualScale) ? 'move' : null)
		);
	}

	private restoreDrawingCursor(): void {
		this.documentModel.overlay.style.cursor = cursorForTool(this.#tool);
	}

	private visualScale(): number {
		const renderedWidth = this.documentModel.overlay.getBoundingClientRect().width;
		return renderedWidth > 0 ? this.documentModel.width / renderedWidth : 1;
	}

	private isContinuationEndpoint(
		stroke: StrokeAnnotation,
		point: Point,
	): boolean {
		const endpoints = transformedStrokePoints(stroke);
		return [endpoints[0], endpoints.at(-1)].some(
			(endpoint) =>
				Boolean(
					endpoint &&
						Math.hypot(point.x - endpoint.x, point.y - endpoint.y) <=
							STROKE_ENDPOINT_HIT_TOLERANCE * this.visualScale(),
				),
		);
	}

}

function strokePoint(point: Point, pressure: number): StrokePoint {
	return { ...point, pressure: pressure || 1 };
}

function expandedStrokeBounds(
	current: CropRect,
	point: Point,
	strokeSize: number,
): CropRect {
	const padding = strokeSize / 2;
	const left = Math.min(current.x, point.x - padding);
	const top = Math.min(current.y, point.y - padding);
	const right = Math.max(current.x + current.width, point.x + padding);
	const bottom = Math.max(current.y + current.height, point.y + padding);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function randomSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function fillBounds(runs: readonly FloodFillRun[]): CropRect {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const run of runs) {
		left = Math.min(left, run.x);
		top = Math.min(top, run.y);
		right = Math.max(right, run.x + run.length);
		bottom = Math.max(bottom, run.y + 1);
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function isPaintTool(tool: Tool): tool is PaintTool {
	return isToolKind(tool, DrawingToolKind.Paint);
}
function cursorForTool(tool: Tool): string {
	return drawingToolBehavior(tool).cursor;
}
