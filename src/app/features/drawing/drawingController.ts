import { CropSelectionKind } from './cropSelectionTypes';
import { EditorCursorVariant, presentEditorCursor } from '../../shared/style/editorCursors';
import { ToolColorShortcut } from './toolColorsControl';
import { ColorPickerGuard } from './colorPickerGuard';
import {
	PaintToolId,
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { acceptsTyping, element } from '../../shared/dom/domHelpers';
import { KeyboardKey } from '../../shared/input/keyboardKeys';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import type { CanvasViewportController } from '../workspace/canvasViewportController';
import { CanvasSelectionGesture } from './canvasSelectionGesture';
import { canvasPoint } from './drawingHelpers';
import {
	drawingToolBehavior,
	isMarkupTool,
	isPaintTool,
	isShapeTool,
	selectionPresentationFor,
	toolEditsLayer,
	isPathTool,
} from './drawingToolBehavior';
import { SelectionPresentation } from '../annotations/selectionOverlayRenderer';
import { toolForShortcut } from './drawingToolCatalog';
import { DrawingToolControls } from './drawingToolControls';
import { DrawingToolRouter } from './drawingToolRouter';
import type { DrawingGesture } from './gestures/drawingGesture';

interface GestureSession {
	readonly gesture: DrawingGesture;
	readonly scroll: Point | null;
}

/** Coordinates tool ownership and routes normalized input to one active gesture. */
export class DrawingController {
	readonly #canvasWrap = element<HTMLElement>('#canvasWrap');
	readonly #colorPicker = new ColorPickerGuard();
	readonly #controls: DrawingToolControls;
	readonly #router: DrawingToolRouter;
	readonly #selectionGesture?: CanvasSelectionGesture;
	#session: GestureSession | null = null;
	#activeTool: Tool | null = null;

	constructor(
		readonly documentModel: CanvasDocument,
		readonly viewport?: CanvasViewportController,
		readonly shapes?: AnnotationDocument,
		readonly rasterSelection?: RasterSelection,
	) {
		if (shapes) this.#selectionGesture = new CanvasSelectionGesture(shapes);
		this.#controls = new DrawingToolControls(
			documentModel,
			shapes,
			viewport,
			() => this.cancelCrop(),
		);
		this.#router = new DrawingToolRouter(
			documentModel,
			shapes,
			viewport,
			rasterSelection,
			this.#controls,
		);
		this.#controls.onSelection((tool) => this.activateTool(tool));
		this.bindEvents();
		this.activateTool(this.#controls.tool, false);
	}

	get tool(): Tool {
		return this.#controls.tool;
	}

	setInitialColor(theme: string): void {
		this.#controls.setInitialColor(theme);
	}
	select(tool: Tool): void {
		this.#controls.select(tool);
	}

	/** A shortcut key: D resets the colours, Shift+X swaps them, and any other tool key chooses its tool. */
	handleShortcut(key: string, shift: boolean): boolean {
		if (key === ToolColorShortcut.Reset && !shift) {
			this.#controls.resetColors();
			return true;
		}
		if (key === ToolColorShortcut.Swap && shift) {
			this.#controls.swapColors();
			return true;
		}
		return this.selectFromShortcut(key);
	}

	selectFromShortcut(key: string): boolean {
		const tool = toolForShortcut(key);
		if (!tool) return false;
		this.select(tool);
		return true;
	}

	editObject(objectId: string): void {
		if (!this.shapes?.isEditable(objectId)) return;
		this.documentModel.layers.select(CoreLayerId.Objects);
		this.shapes.select(objectId);
		this.select(UtilityToolId.Select);
		this.shapes.select(objectId);
	}

	/** Selects a whole layer with the Select tool, so it can be moved. */
	editLayer(layerId: string): void {
		if (!this.shapes?.isLayerEditable(layerId)) return;
		this.documentModel.layers.select(CoreLayerId.Objects);
		this.select(UtilityToolId.Select);
		this.shapes.selectLayer(layerId);
	}

	/**
	 * Shows an item chosen in the layer list: a tool that shows and transforms
	 * that item stays; otherwise Select is picked so the item is visible and
	 * editable on the canvas.
	 */
	revealItem(itemId: string): void {
		const item = this.shapes?.object(itemId);
		const tool = this.#controls.tool;
		const showsItem =
			item !== null &&
			item !== undefined &&
			toolEditsLayer(tool, item.type) &&
			selectionPresentationFor(tool) === SelectionPresentation.Transform;
		if (item && !showsItem) this.editObject(itemId);
	}

	onToolChange(listener: (tool: Tool) => void): void {
		this.#controls.onSelection(listener);
	}

	/** Told when a path's points start or stop being edited. */
	onPathPointEditingChange(listener: (editing: boolean) => void): void {
		this.#router.onPathPointEditingChange(listener);
	}

	private activateTool(tool: Tool, clearSelection = true): void {
		const previousTool = this.#activeTool;
		// A path under way is kept, not lost, when another tool is chosen; its points are edited only with Select.
		this.#router.finishPen();
		if (tool !== UtilityToolId.Select) this.#router.stopEditingPathPoints();
		this.#router.setGradientHandlesActive(tool === UtilityToolId.Select);
		this.#activeTool = tool;
		this.cancelGesture();
		this.#selectionGesture?.clear();
		if (tool !== UtilityToolId.Select) this.rasterSelection?.clear();
		if (clearSelection && !this.preservesSelection(tool))
			this.shapes?.clearSelection();
		else if (tool === UtilityToolId.Select && previousTool && createsItems(previousTool))
			this.selectLayerOfDrawnItem();
		this.documentModel.overlay.classList.toggle(
			'fill-cursor',
			tool === UtilityToolId.Fill,
		);
		this.restoreDrawingCursor();
		if (tool !== UtilityToolId.Crop && tool !== UtilityToolId.Select) {
			this.#router.cancelCrop();
			this.documentModel.clearOverlay();
		}
	}

	/** Select starts at layer level: the item just drawn hands over its whole layer. */
	private selectLayerOfDrawnItem(): void {
		const item = this.shapes?.selected;
		const layer = item ? this.shapes?.layerOf(item.id) : null;
		if (layer) this.shapes?.selectLayer(layer.id);
	}

	private preservesSelection(tool: Tool): boolean {
		return (
			tool === UtilityToolId.Select ||
			tool === UtilityToolId.Crop ||
			// Fill keeps the selection that limits where it spreads.
			tool === UtilityToolId.Fill ||
			tool === PaintToolId.Eraser ||
			(isPaintTool(tool) &&
				this.shapes?.selected?.type === AnnotationObjectTypeId.RasterFragment)
		);
	}

	private bindEvents(): void {
		const overlay = this.documentModel.overlay;
		overlay.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			if (this.#colorPicker.closesPicker()) return;
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
			if (isPathTool(this.#controls.tool)) {
				this.#router.finishPen();
				return;
			}
			const targetId = this.#selectionGesture?.selectionTarget(
				this.point(event),
				event,
			);
			const target = targetId ? this.shapes?.object(targetId) : null;
			if (target?.type === AnnotationObjectTypeId.Text)
				this.#router.editText(target, event);
			else if (targetId) this.editObject(targetId);
			if (target?.type === AnnotationObjectTypeId.Path) this.#router.editPathPoints(target.id);
		});
		overlay.addEventListener('pointerleave', () => {
			if (!this.#session) this.restoreDrawingCursor();
		});
		document.addEventListener('keydown', (event) => this.onKeyDown(event));
		document.addEventListener('keyup', (event) =>
			this.updateZoomCursor(event.altKey),
		);
		window.addEventListener('blur', () => this.updateZoomCursor(false));
	}

	private onPointerDown(event: PointerEvent): void {
		if (
			event.button !== 0 ||
			!this.documentModel.hasImage ||
			!this.canInteract()
		)
			return;
		this.updateZoomCursor(event.altKey);
		const point = this.point(event);
		if (this.#router.editingPathPoints) {
			const pointGesture = this.#router.beginPathPointEdit(point, this.visualScale(), event.altKey);
			if (pointGesture) {
				this.startSession(pointGesture, event);
				return;
			}
			// A press that switched a node between corner and curve is used up; one elsewhere ended the editing.
			if (this.#router.editingPathPoints) return;
		}
		const gradientDrag = this.#router.beginGradientDrag(point, this.visualScale());
		if (gradientDrag) {
			this.startSession(gradientDrag, event);
			return;
		}
		const tool = this.#controls.tool;
		if (isPaintTool(tool)) this.#selectionGesture?.begin(point, event);
		else this.#selectionGesture?.clear();
		const gesture = this.#router.begin(tool, point, event, this.visualScale());
		if (gesture) this.startSession(gesture, event);
	}

	private startSession(gesture: DrawingGesture, event: PointerEvent): void {
		this.#session = {
			gesture,
			scroll: gesture.locksScroll
				? { x: this.#canvasWrap.scrollLeft, y: this.#canvasWrap.scrollTop }
				: null,
		};
		this.documentModel.overlay.setPointerCapture(event.pointerId);
	}

	private canInteract(): boolean {
		return (
			this.documentModel.layers.isEditable(CoreLayerId.Objects) ||
			(this.#controls.tool === PaintToolId.Eraser &&
				this.documentModel.layers.isEditable(CoreLayerId.Image)) ||
			this.#controls.tool === UtilityToolId.Crop ||
			(this.#controls.tool === UtilityToolId.Select &&
				this.documentModel.layers.isEditable(CoreLayerId.Image))
		);
	}

	private onPointerMove(event: PointerEvent): void {
		this.#selectionGesture?.move(event);
		const gesture = this.#session?.gesture;
		if (!gesture) {
			if (isPathTool(this.#controls.tool)) this.#router.hoverPen(this.point(event));
			if (this.shapes || this.#controls.tool === UtilityToolId.Crop)
				this.presentCursor(this.#router.cursor(this.#controls.tool, this.point(event), this.visualScale()));
			return;
		}
		event.preventDefault();
		this.restoreLockedScroll();
		const samples = gesture.coalesced
			? (event.getCoalescedEvents?.() ?? [])
			: [];
		const modifiers = { constrained: event.shiftKey };
		for (const sample of samples)
			gesture.update(this.point(sample), sample.pressure, modifiers);
		const last = samples.at(-1);
		if (last?.clientX !== event.clientX || last.clientY !== event.clientY)
			gesture.update(this.point(event), event.pressure, modifiers);
	}

	private onPointerUp(event: PointerEvent): void {
		const session = this.#session;
		if (!session) return;
		this.restoreLockedScroll();
		this.#session = null;
		session.gesture.complete(this.point(event));
		this.#selectionGesture?.finish(event);
	}

	private onKeyDown(event: KeyboardEvent): void {
		this.updateZoomCursor(event.altKey);
		if (this.#router.penDrawing && !acceptsTyping(event.target) && (event.key === KeyboardKey.Enter || event.key === KeyboardKey.Escape)) {
			event.preventDefault();
			if (event.key === KeyboardKey.Enter) this.#router.finishPen();
			else this.#router.cancelPen();
			return;
		}
		if (this.#router.editingPathPoints && !acceptsTyping(event.target) && this.handlePathPointKey(event)) return;
		if (
			(event.key === 'Delete' || event.key === 'Backspace') &&
			!acceptsTyping(event.target) &&
			this.shapes?.selected &&
			this.shapes.isEditable(this.shapes.selected.id)
		) {
			event.preventDefault();
			this.shapes.removeSelected();
			return;
		}
		if (
			(this.#controls.tool === UtilityToolId.Crop ||
				this.#controls.tool === UtilityToolId.Select) &&
			!acceptsTyping(event.target) &&
			event.key === 'Escape'
		) {
			event.preventDefault();
			this.cancelCrop();
		}
	}

	/** Delete removes the chosen node and Escape ends the editing; whether the key was used. */
	private handlePathPointKey(event: KeyboardEvent): boolean {
		if (event.key === KeyboardKey.Escape) this.#router.stopEditingPathPoints();
		else if (!((event.key === KeyboardKey.Delete || event.key === KeyboardKey.Backspace) && this.#router.removeSelectedPathNode())) return false;
		event.preventDefault();
		return true;
	}

	private cancelCrop(): void {
		this.cancelGesture();
		this.#router.cancelCrop();
	}

	private cancelGesture(): void {
		const session = this.#session;
		this.restoreLockedScroll();
		this.#session = null;
		session?.gesture.cancel();
	}

	private restoreLockedScroll(): void {
		const scroll = this.#session?.scroll;
		if (!scroll) return;
		this.#canvasWrap.scrollLeft = scroll.x;
		this.#canvasWrap.scrollTop = scroll.y;
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
		if (this.#controls.tool === UtilityToolId.Zoom)
			this.presentCursor(zoomOut ? 'zoom-out' : 'zoom-in');
	}

	private restoreDrawingCursor(): void {
		this.presentCursor(drawingToolBehavior(this.#controls.tool).cursor);
	}

	private presentCursor(state: string): void {
		presentEditorCursor(
			this.documentModel.overlay,
			this.#controls.tool,
			state,
			this.#controls.cropSelectionKind === CropSelectionKind.Lasso ? EditorCursorVariant.Lasso : undefined,
		);
	}

	private visualScale(): number {
		const width = this.documentModel.overlay.getBoundingClientRect().width;
		return width > 0 ? this.documentModel.width / width : 1;
	}
}


/** Tools that draw new items: brushes, shapes and markup; the eraser only edits. */
function createsItems(tool: Tool): boolean {
	return (
		(isPaintTool(tool) && tool !== PaintToolId.Eraser) ||
		isShapeTool(tool) ||
		isMarkupTool(tool)
	);
}
