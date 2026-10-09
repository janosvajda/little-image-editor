import {
	PaintToolId,
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { element } from '../../shared/dom/domHelpers';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import type { CanvasViewportController } from '../workspace/canvasViewportController';
import { CanvasSelectionGesture } from './canvasSelectionGesture';
import { CUT_MOVE_CROP_REQUEST_EVENT } from './cropEvents';
import { canvasPoint } from './drawingHelpers';
import { drawingToolBehavior, isPaintTool } from './drawingToolBehavior';
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
	readonly #controls: DrawingToolControls;
	readonly #router: DrawingToolRouter;
	readonly #selectionGesture?: CanvasSelectionGesture;
	readonly #interactionListeners = new Set<() => void>();
	#session: GestureSession | null = null;
	#interactionsActive = true;

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
		this.#controls.onSelection((tool) => {
			this.#interactionsActive = true;
			this.#interactionListeners.forEach((listener) => listener());
			this.activateTool(tool);
		});
		this.bindEvents();
		document.addEventListener(CUT_MOVE_CROP_REQUEST_EVENT, () =>
			this.select(UtilityToolId.Crop),
		);
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

	onToolChange(listener: (tool: Tool) => void): void {
		this.#controls.onSelection(listener);
	}

	onInteractionRequested(listener: () => void): void {
		this.#interactionListeners.add(listener);
	}

	suspendInteractions(): void {
		this.#interactionsActive = false;
		this.cancelGesture();
	}

	private activateTool(tool: Tool, clearSelection = true): void {
		this.cancelGesture();
		this.#selectionGesture?.clear();
		if (tool !== UtilityToolId.Select) this.rasterSelection?.clear();
		if (clearSelection && !this.preservesSelection(tool))
			this.shapes?.clearSelection();
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

	private preservesSelection(tool: Tool): boolean {
		return (
			tool === UtilityToolId.Select ||
			tool === UtilityToolId.Crop ||
			tool === PaintToolId.Eraser ||
			(isPaintTool(tool) &&
				this.shapes?.selected?.type === AnnotationObjectTypeId.RasterFragment)
		);
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
			if (!this.#interactionsActive) return;
			const targetId = this.#selectionGesture?.selectionTarget(
				this.point(event),
				event,
			);
			if (targetId) this.editObject(targetId);
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
			!this.#interactionsActive ||
			!this.documentModel.hasImage ||
			!this.canInteract()
		)
			return;
		this.updateZoomCursor(event.altKey);
		const point = this.point(event);
		const tool = this.#controls.tool;
		if (isPaintTool(tool)) this.#selectionGesture?.begin(point, event);
		else this.#selectionGesture?.clear();
		const gesture = this.#router.begin(tool, point, event, this.visualScale());
		if (!gesture) return;
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
			if (this.shapes || this.#controls.tool === UtilityToolId.Crop)
				this.documentModel.overlay.style.cursor = this.#router.cursor(
					this.#controls.tool,
					this.point(event),
					this.visualScale(),
				);
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
		if (
			(event.key === 'Delete' || event.key === 'Backspace') &&
			!isEditableTarget(event.target) &&
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
			!isEditableTarget(event.target) &&
			event.key === 'Escape'
		) {
			event.preventDefault();
			this.cancelCrop();
		}
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
			this.documentModel.overlay.style.cursor = zoomOut
				? 'zoom-out'
				: 'zoom-in';
	}

	private restoreDrawingCursor(): void {
		this.documentModel.overlay.style.cursor = drawingToolBehavior(
			this.#controls.tool,
		).cursor;
	}

	private visualScale(): number {
		const width = this.documentModel.overlay.getBoundingClientRect().width;
		return width > 0 ? this.documentModel.width / width : 1;
	}
}

function isEditableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}
