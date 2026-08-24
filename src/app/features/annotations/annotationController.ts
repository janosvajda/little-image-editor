import { canvasPoint } from '../drawing/drawingHelpers';
import type { CropRect, Point } from '../../core/document/appTypes';
import type { CaptureSourceMetadata } from '../../core/document/browserCapture';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { CanvasViewportController } from '../workspace/canvasViewportController';
import { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import {
	TOOLBAR_AUTO_OPEN_EVENT,
	TOOLBAR_VISIBILITY_EVENT,
	type ToolbarVisibilityDetail,
} from '../workspace/managedToolbarPanel';
import {
	AnnotationDocument,
	annotationBounds,
	normalizedRect,
} from './annotationDocument';
import { AnnotationPanel } from './annotationPanel';
import { renderAnnotations } from './annotationRenderer';
import {
	AnnotationObjectTypeId,
	AnnotationToolId,
	type AnnotationObject,
	type AnnotationSessionState,
	type AnnotationState,
	type AnnotationStyle,
	type AnnotationTool,
} from './annotationTypes';
import { formatBugReport } from './bugReportMetadata';
import type { ShapeHandle } from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import { ColorPalette } from '../../core/document/colorPalette';
import { InlineTextEditor } from './inlineTextEditor';
import {
	textFrame,
	TextShapeMetrics,
} from '../../core/geometry/textShapeMetrics';
import type { TextAnnotation } from './annotationTypes';

const STATE_KEY = 'annotations';
const AnnotationInteraction = {
	MinimumStepMarkerSize: 22,
	StepMarkerSizeFactor: 6,
	DragThreshold: 3,
	MinimumTextSize: 12,
	TextSizeFactor: 4,
	CropDashLength: 6,
	CropDashGap: 4,
	PercentScale: 100,
} as const;
interface ToolSelectionOptions {
	readonly persistPreferences?: boolean;
	readonly clearObjectSelection?: boolean;
}

export class AnnotationController {
	readonly annotations: AnnotationDocument;
	readonly canvas = document.createElement('canvas');
	#context: CanvasRenderingContext2D;
	#active = false;
	#tool: AnnotationTool = AnnotationToolId.Select;
	#start: Point | null = null;
	#last: Point | null = null;
	#draggedId: string | null = null;
	#transformHandle: ShapeHandle | null = null;
	#pendingSelectionId: string | null = null;
	#draft: AnnotationObject | null = null;
	#crop: CropRect | null = null;
	#restoring = false;
	#historyListeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	readonly #preferences: PersistentDocumentToolbar<{
		tool: AnnotationTool;
		reportEdited: boolean;
	}>;
	#reportEdited = false;
	readonly #textEditor = new InlineTextEditor();
	readonly #interactionListeners = new Set<() => void>();

	constructor(
		private readonly documentModel: CanvasDocument,
		viewport: CanvasViewportController,
		readonly panel = new AnnotationPanel(),
		preferences?: PersistentDocumentToolbar<{
			tool: AnnotationTool;
			reportEdited: boolean;
		}>,
		annotations = new AnnotationDocument(),
	) {
		this.annotations = annotations;
		this.canvas.className = 'annotation-canvas';
		this.canvas.setAttribute('aria-hidden', 'true');
		this.#context = this.canvas.getContext('2d')!;
		viewport.addCanvasLayer(this.canvas);
		if (!this.panel.element.isConnected)
			document.querySelector('.workspace')!.append(this.panel.element);
		this.#preferences =
			preferences ??
			new PersistentDocumentToolbar(
				this.panel.element,
				documentModel,
				'annotations',
			);
		this.#preferences.onRestore((extra) => {
			if (extra?.tool)
				this.selectTool(extra.tool, {
					persistPreferences: false,
					clearObjectSelection: false,
				});
			this.#reportEdited = extra?.reportEdited ?? false;
			if (!this.#reportEdited) this.updateReport();
		});
		this.bindPanel();
		this.panel.element.addEventListener(TOOLBAR_AUTO_OPEN_EVENT, () =>
			this.activate(true),
		);
		this.panel.element.addEventListener(TOOLBAR_VISIBILITY_EVENT, (event) => {
			this.syncPanelVisibility(
				(event as CustomEvent<ToolbarVisibilityDetail>).detail.visible,
			);
		});
		document.addEventListener(TOOLBAR_VISIBILITY_EVENT, (event) => {
			if (
				event.target !== this.panel.element &&
				(event as CustomEvent<ToolbarVisibilityDetail>).detail.visible
			)
				this.releaseFocusPreset();
		});
		this.bindPointerEvents();
		document.addEventListener(
			'keydown',
			(event) => this.onKeyDown(event),
			true,
		);
		this.annotations.onChange((state) => this.onAnnotationChange(state));
		this.annotations.onHistoryChange(() => this.emitHistory());
		documentModel.registerCompositeRenderer((context) =>
			renderAnnotations(context, documentModel.canvas, this.annotations.state),
		);
		documentModel.onBeforeGeometryChange(() => this.flattenShapes(false));
		documentModel.onDocumentChange((snapshot) =>
			this.onDocumentChange(snapshot.hasImage, snapshot.width, snapshot.height),
		);
	}

	get active(): boolean {
		return (
			this.#active ||
			this.annotations.selected?.type === AnnotationObjectTypeId.Shape
		);
	}
	get canUndo(): boolean {
		return this.annotations.canUndo;
	}
	get canRedo(): boolean {
		return this.annotations.canRedo;
	}

	undo(): void {
		this.annotations.undo();
	}
	redo(): void {
		this.annotations.redo();
	}

	onHistoryChange(
		listener: (canUndo: boolean, canRedo: boolean) => void,
	): void {
		this.#historyListeners.add(listener);
		listener(this.canUndo, this.canRedo);
	}

	activate(focused = false): void {
		if (!this.documentModel.hasImage) return;
		this.requestInteractions();
		document.body.classList.toggle('annotation-focus-preset', focused);
		this.enable();
	}

	onInteractionRequested(listener: () => void): void {
		this.#interactionListeners.add(listener);
	}

	suspendInteractions(): void {
		this.disable();
	}

	releaseFocusPreset(): void {
		document.body.classList.remove('annotation-focus-preset');
	}

	syncPanelVisibility(visible: boolean): void {
		if (visible) this.enable();
		else this.disable();
	}

	private enable(): void {
		this.#active = true;
		document.body.classList.add('annotation-mode');
		this.selectTool(this.#tool, {
			persistPreferences: false,
			clearObjectSelection: false,
		});
		this.emitHistory();
	}

	private disable(): void {
		this.#active = false;
		this.#draft = null;
		this.#crop = null;
		document.body.classList.remove('annotation-mode');
		document.body.classList.remove('annotation-focus-preset');
		this.render();
		this.emitHistory();
	}

	private bindPanel(): void {
		this.panel.toolButtons.forEach((button, tool) =>
			button.addEventListener('click', () => {
				this.requestInteractions();
				this.enable();
				this.selectTool(tool);
			}),
		);
		this.panel.undo.addEventListener('click', () => this.annotations.undo());
		this.panel.redo.addEventListener('click', () => this.annotations.redo());
		this.panel.restart.addEventListener('click', () => {
			this.annotations.restartSteps(1);
			this.selectTool(AnnotationToolId.Step);
		});
		this.panel.markerValue.addEventListener('change', () => {
			const value = Number(this.panel.markerValue.value);
			if (Number.isFinite(value)) this.annotations.restartSteps(value);
		});
		this.panel.clear.addEventListener('click', () => this.annotations.clear());
		this.panel.flatten.addEventListener('click', () =>
			this.flattenShapes(true),
		);
		this.panel.cancelCrop.addEventListener('click', () => {
			this.#crop = null;
			this.panel.cropActions.classList.add('hidden');
			this.render();
		});
		this.panel.applyCrop.addEventListener('click', () => {
			if (this.#crop) this.documentModel.crop(this.#crop);
			this.#crop = null;
			this.panel.cropActions.classList.add('hidden');
		});
		for (const input of [
			this.panel.expected,
			this.panel.actual,
			this.panel.includeUrl,
			this.panel.includeEnvironment,
		])
			input.addEventListener('input', () => {
				this.#reportEdited = false;
				this.updateReport();
				this.persistPreferences();
			});
		this.panel.reportPreview.addEventListener('input', () => {
			this.#reportEdited = true;
			this.persistPreferences();
		});
		this.panel.copyReport.addEventListener(
			'click',
			() => void navigator.clipboard.writeText(this.panel.reportPreview.value),
		);
	}

	private bindPointerEvents(): void {
		const overlay = this.documentModel.overlay;
		overlay.addEventListener(
			'pointerdown',
			(event) => this.onPointerDown(event),
			true,
		);
		overlay.addEventListener(
			'pointermove',
			(event) => this.onPointerMove(event),
			true,
		);
		overlay.addEventListener(
			'pointerup',
			(event) => this.onPointerUp(event),
			true,
		);
		overlay.addEventListener(
			'dblclick',
			(event) => this.onDoubleClick(event),
			true,
		);
		overlay.addEventListener(
			'pointerleave',
			() => {
				if (!this.#start) this.restoreToolCursor();
			},
			true,
		);
	}

	private onPointerDown(event: PointerEvent): void {
		if (!this.#active || event.button !== 0) return;
		consume(event);
		this.documentModel.overlay.setPointerCapture(event.pointerId);
		const point = this.point(event);
		this.#start = point;
		this.#last = point;
		const selected = this.annotations.selected;
		const selectedShape = selected ? genericShape(selected) : null;
		const selectedHandle = selectedShape?.hitHandle(point) ?? null;
		if (selected && selectedHandle) {
			this.#draggedId = selected.id;
			this.#transformHandle = selectedHandle;
			return;
		}
		if (selected && selectedShape?.contains(point)) {
			this.#draggedId = selected.id;
			return;
		}
		if (this.#tool === AnnotationToolId.Select) {
			const hit = this.annotations.hitTest(point);
			this.annotations.select(hit?.id ?? null);
			this.#draggedId = hit?.id ?? null;
			return;
		}
		const hit = this.annotations.hitTest(point);
		if (hit) {
			this.#pendingSelectionId = hit.id;
			return;
		}
		if (this.#tool === AnnotationToolId.Step) {
			this.annotations.add({
				id: id(),
				type: AnnotationObjectTypeId.Step,
				at: point,
				value: this.annotations.state.nextStep,
				color: this.style.color,
				size: Math.max(
					AnnotationInteraction.MinimumStepMarkerSize,
					this.style.size * AnnotationInteraction.StepMarkerSizeFactor,
				),
			});
			return;
		}
		if (this.#tool === AnnotationToolId.Text) {
			this.createTextAt(point, event.clientX, event.clientY);
			return;
		}
		this.#draft = this.createDraft(point);
		this.render();
	}

	private onPointerMove(event: PointerEvent): void {
		if (!this.#active) return;
		if (!this.#start) {
			this.updateHoverCursor(this.point(event));
			return;
		}
		consume(event);
		const point = this.point(event);
		if (this.#pendingSelectionId) {
			if (
				Math.hypot(point.x - this.#start.x, point.y - this.#start.y) <
				AnnotationInteraction.DragThreshold
			)
				return;
			this.#pendingSelectionId = null;
			this.#draft = this.createDraft(this.#start);
		}
		if (this.#draggedId && this.#transformHandle)
			this.annotations.transformSelected(this.#transformHandle, point, false);
		else if (this.#draggedId && this.#last)
			this.annotations.move(
				this.#draggedId,
				{ x: point.x - this.#last.x, y: point.y - this.#last.y },
				false,
			);
		else if (this.#draft) this.updateDraft(this.#draft, this.#start, point);
		this.#last = point;
		this.render();
	}

	private onDoubleClick(event: MouseEvent): void {
		if (!this.#active) return;
		const hit = this.annotations.hitTest(this.point(event));
		if (hit?.type !== AnnotationObjectTypeId.Text) return;
		consume(event);
		this.editText(hit, event.clientX, event.clientY);
	}

	private createTextAt(point: Point, clientX: number, clientY: number): void {
		const initialText = this.panel.text.value.trim();
		const fontSize = Math.max(
			AnnotationInteraction.MinimumTextSize,
			this.style.size * AnnotationInteraction.TextSizeFactor,
		);
		const objectId = id();
		if (initialText)
			this.annotations.add({
				id: objectId,
				type: AnnotationObjectTypeId.Text,
				at: point,
				text: initialText,
				color: this.style.color,
				size: fontSize,
				rect: textFrame(point, initialText, fontSize),
			});
		this.openTextEditor(
			{
				id: objectId,
				type: AnnotationObjectTypeId.Text,
				at: point,
				text: initialText,
				color: this.style.color,
				size: fontSize,
				rect: textFrame(point, initialText, fontSize),
			},
			clientX,
			clientY,
			!initialText,
		);
	}

	private editText(
		object: TextAnnotation,
		clientX: number,
		clientY: number,
	): void {
		this.annotations.select(object.id);
		this.openTextEditor(structuredClone(object), clientX, clientY, false);
	}

	private openTextEditor(
		original: TextAnnotation,
		clientX: number,
		clientY: number,
		addOnCommit: boolean,
	): void {
		const scaledFontSize = Math.max(
			TextShapeMetrics.MinimumFontSize,
			original.size * this.viewportZoom(),
		);
		const applyText = (value: string, commit: boolean) => {
			if (addOnCommit) {
				if (commit && value)
					this.annotations.add({
						...original,
						text: value,
						rect: textFrame(original.at, value, original.size),
					});
				return;
			}
			this.annotations.update(
				original.id,
				(object) => {
					if (object.type !== AnnotationObjectTypeId.Text) return;
					object.text = value;
					const current = genericShape(object).geometry.rect;
					const measured = textFrame(object.at, value, object.size);
					object.rect = { ...current, width: measured.width };
				},
				commit,
			);
		};
		this.#textEditor.open({
			value: original.text,
			clientX,
			clientY,
			fontSize: scaledFontSize,
			color: original.color,
			onInput: (value) => applyText(value, false),
			onCommit: (value) => {
				applyText(value, true);
				this.panel.text.value = value;
			},
			onCancel: () => {
				if (!addOnCommit)
					this.annotations.update(
						original.id,
						(object) => Object.assign(object, original),
						false,
					);
			},
		});
	}

	private viewportZoom(): number {
		return (
			this.documentModel.overlay.getBoundingClientRect().width /
			Math.max(1, this.documentModel.width)
		);
	}

	private onPointerUp(event: PointerEvent): void {
		if (!this.#active || !this.#start) return;
		consume(event);
		const point = this.point(event);
		if (this.#pendingSelectionId)
			this.annotations.select(this.#pendingSelectionId);
		else if (this.#draggedId) this.annotations.commitCurrent();
		else if (this.#draft) {
			this.updateDraft(this.#draft, this.#start, point);
			if (this.#tool === AnnotationToolId.Crop) {
				this.#crop = normalizedRect(this.#start, point);
				this.panel.cropActions.classList.toggle(
					'hidden',
					this.#crop.width < 1 || this.#crop.height < 1,
				);
			} else if (validObject(this.#draft)) this.annotations.add(this.#draft);
		}
		this.#start = this.#last = null;
		this.#draggedId = null;
		this.#transformHandle = null;
		this.#pendingSelectionId = null;
		this.#draft = null;
		this.render();
	}

	private createDraft(point: Point): AnnotationObject {
		const style = this.style;
		if (this.#tool === AnnotationToolId.Arrow)
			return {
				id: id(),
				type: AnnotationObjectTypeId.Arrow,
				from: point,
				to: point,
				color: style.color,
				width: style.size,
			};
		const type =
			this.#tool === AnnotationToolId.Crop
				? AnnotationObjectTypeId.Box
				: (this.#tool as
						| typeof AnnotationObjectTypeId.Box
						| typeof AnnotationObjectTypeId.Highlight
						| typeof AnnotationObjectTypeId.Blur
						| typeof AnnotationObjectTypeId.Redact);
		return {
			id: id(),
			type,
			rect: { x: point.x, y: point.y, width: 0, height: 0 },
			color:
				type === AnnotationObjectTypeId.Redact
					? ColorPalette.Black
					: style.color,
			width: style.size,
			opacity: style.opacity,
			blur: style.blur,
		};
	}

	private updateDraft(object: AnnotationObject, from: Point, to: Point): void {
		if (object.type === AnnotationObjectTypeId.Arrow) object.to = to;
		else if ('rect' in object) object.rect = normalizedRect(from, to);
	}

	private selectTool(
		tool: AnnotationTool,
		options: ToolSelectionOptions = {},
	): void {
		const { persistPreferences = true, clearObjectSelection = true } = options;
		const changed = tool !== this.#tool;
		this.#tool = tool;
		this.#crop = null;
		this.panel.cropActions.classList.add('hidden');
		if (changed && clearObjectSelection && tool !== AnnotationToolId.Select)
			this.annotations.select(null);
		this.panel.setActiveTool(tool);
		this.documentModel.overlay.style.cursor = cursorForAnnotationTool(tool);
		this.render();
		if (persistPreferences) this.persistPreferences();
	}

	private updateHoverCursor(point: Point): void {
		const selected = this.annotations.selected;
		const selectedCursor = selected
			? genericShape(selected).cursorAt(point)
			: null;
		if (selectedCursor) {
			this.documentModel.overlay.style.cursor = selectedCursor;
			return;
		}
		if (this.#tool === AnnotationToolId.Select) {
			const hit = this.annotations.hitTest(point);
			this.documentModel.overlay.style.cursor = hit ? 'move' : 'default';
		} else this.restoreToolCursor();
	}

	private restoreToolCursor(): void {
		this.documentModel.overlay.style.cursor = cursorForAnnotationTool(
			this.#tool,
		);
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (!this.#active || isEditable(event.target)) return;
		const modifier = event.ctrlKey || event.metaKey;
		if (modifier && ['z', 'y'].includes(event.key.toLowerCase())) return;
		if (event.key === '1') {
			consume(event);
			this.annotations.restartSteps(1);
			this.selectTool(AnnotationToolId.Step);
			return;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			consume(event);
			this.annotations.removeSelected();
			return;
		}
		if (event.key === 'Escape') {
			consume(event);
			this.selectTool(AnnotationToolId.Select);
			return;
		}
		const shortcut = (
			{
				v: AnnotationToolId.Select,
				a: AnnotationToolId.Arrow,
				b: AnnotationToolId.Box,
				h: AnnotationToolId.Highlight,
				t: AnnotationToolId.Text,
				u: AnnotationToolId.Blur,
				r: AnnotationToolId.Redact,
				c: AnnotationToolId.Crop,
			} as const
		)[event.key.toLowerCase() as 'v'];
		if (shortcut) {
			consume(event);
			this.selectTool(shortcut);
		}
	}

	private onDocumentChange(
		hasImage: boolean,
		width: number,
		height: number,
	): void {
		this.canvas.width = width;
		this.canvas.height = height;
		this.#restoring = true;
		const persisted = hasImage
			? this.documentModel.toolbarState<
					AnnotationSessionState | AnnotationState
				>(STATE_KEY)
			: undefined;
		if (persisted && 'state' in persisted)
			this.annotations.restoreSession(persisted);
		else this.annotations.restore(persisted);
		this.#restoring = false;
		if (!this.panel.element.hidden) this.enable();
		else this.disable();
		this.updateReport();
		this.render();
	}

	private onAnnotationChange(state: Readonly<AnnotationState>): void {
		if (!this.#restoring && this.documentModel.hasImage)
			this.documentModel.setToolbarState(
				STATE_KEY,
				this.annotations.snapshotSession(),
			);
		this.panel.undo.disabled = !this.annotations.canUndo;
		this.panel.redo.disabled = !this.annotations.canRedo;
		this.panel.nextStep.textContent = `Next marker: ${state.nextStep}`;
		this.panel.markerValue.value = String(state.nextStep);
		this.render();
	}

	private render(): void {
		this.#context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		const selectedId =
			this.#active ||
			this.annotations.selected?.type === AnnotationObjectTypeId.Shape
				? this.annotations.selectedId
				: null;
		renderAnnotations(
			this.#context,
			this.documentModel.canvas,
			this.annotations.state,
			selectedId,
		);
		if (this.#draft)
			renderAnnotations(this.#context, this.documentModel.canvas, {
				objects: [this.#draft],
				nextStep: 1,
			});
		if (this.#crop) {
			this.#context.save();
			this.#context.strokeStyle = ColorPalette.Selection;
			this.#context.lineWidth = 1;
			this.#context.setLineDash([
				AnnotationInteraction.CropDashLength,
				AnnotationInteraction.CropDashGap,
			]);
			this.#context.strokeRect(
				this.#crop.x,
				this.#crop.y,
				this.#crop.width,
				this.#crop.height,
			);
			this.#context.restore();
		}
	}

	flattenShapes(commit = true): void {
		if (this.annotations.state.objects.length === 0) return;
		const layer = document.createElement('canvas');
		layer.width = this.documentModel.width;
		layer.height = this.documentModel.height;
		renderAnnotations(
			layer.getContext('2d')!,
			this.documentModel.canvas,
			this.annotations.state,
		);
		this.documentModel.context.drawImage(layer, 0, 0);
		this.annotations.restore();
		if (commit) this.documentModel.commit();
	}

	private updateReport(): void {
		if (this.#reportEdited) return;
		this.panel.reportPreview.value = formatBugReport({
			source:
				this.documentModel.toolbarState<CaptureSourceMetadata>(
					'captureMetadata',
				),
			screenshot: {
				width: this.documentModel.width,
				height: this.documentModel.height,
			},
			expected: this.panel.expected.value,
			actual: this.panel.actual.value,
			includeUrl: this.panel.includeUrl.checked,
			includeEnvironment: this.panel.includeEnvironment.checked,
		});
	}

	private point(event: Pick<PointerEvent, 'clientX' | 'clientY'>): Point {
		return canvasPoint(
			event,
			this.documentModel.overlay.getBoundingClientRect(),
			this.documentModel.width,
			this.documentModel.height,
		);
	}
	private get style(): AnnotationStyle {
		return {
			color: this.panel.color.value,
			size: Number(this.panel.size.value),
			opacity:
				Number(this.panel.opacity.value) / AnnotationInteraction.PercentScale,
			blur: Number(this.panel.blur.value),
		};
	}

	private emitHistory(): void {
		this.#historyListeners.forEach((listener) =>
			listener(this.canUndo, this.canRedo),
		);
	}
	private persistPreferences(): void {
		this.#preferences.setExtra({
			tool: this.#tool,
			reportEdited: this.#reportEdited,
		});
	}
	private requestInteractions(): void {
		this.#interactionListeners.forEach((listener) => listener());
	}
}

function id(): string {
	return crypto.randomUUID();
}
function consume(event: Event): void {
	event.preventDefault();
	event.stopImmediatePropagation();
}
function isEditable(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		target.matches('input,textarea,select,[contenteditable=true]')
	);
}
function validObject(object: AnnotationObject): boolean {
	if (object.type === AnnotationObjectTypeId.Arrow)
		return (
			Math.hypot(object.to.x - object.from.x, object.to.y - object.from.y) >= 2
		);
	return (
		'rect' in object &&
		object.rect !== undefined &&
		object.rect.width >= 2 &&
		object.rect.height >= 2
	);
}
function cursorForAnnotationTool(tool: AnnotationTool): string {
	if (tool === AnnotationToolId.Select) return 'default';
	if (tool === AnnotationToolId.Text) return 'text';
	return 'crosshair';
}
