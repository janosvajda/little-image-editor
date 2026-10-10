import type { CanvasDocument } from '../../core/document/imageDocument';
import { DocumentGeometryChangeKind } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { requiresImageBackdrop } from '../layers/layerCompositing';
import type { CanvasViewportController } from '../workspace/canvasViewportController';
import {
	AnnotationChangeKind,
	type AnnotationDocument,
} from './annotationDocument';
import { AnnotationRenderCache } from './annotationRenderCache';
import { renderAnnotations } from './annotationRenderer';
import type {
	AnnotationObject,
	AnnotationSessionState,
	AnnotationStateInput,
} from './annotationTypes';
import {
	SelectionOverlayRenderer,
	SelectionPresentation,
} from './selectionOverlayRenderer';

/** Where the layers are kept in the document's saved state. */
const LAYER_STATE_KEY = 'annotations';

/** The canvas surfaces the layers and their selection are drawn on. */
export type ContentLayerViewport = Pick<CanvasViewportController, 'addCanvasLayer'> &
	Partial<Pick<CanvasViewportController, 'addStageLayer' | 'onViewChange'>>;

/**
 * Draws the content layers above the image and shows the selection, for every
 * tool. It also composites the layers into exports, keeps them aligned with
 * the image through crops and other geometry changes, and saves them with the
 * document.
 */
export class ContentLayerCanvas {
	readonly canvas = document.createElement('canvas');
	readonly #context: CanvasRenderingContext2D;
	readonly #renderCache = new AnnotationRenderCache();
	readonly #selectionOverlay = new SelectionOverlayRenderer();
	#selectionPresentation: SelectionPresentation = SelectionPresentation.Transform;
	#transientRenderFrame: number | null = null;
	#restoring = false;

	constructor(
		private readonly documentModel: CanvasDocument,
		viewport: ContentLayerViewport,
		readonly layers: AnnotationDocument,
		private readonly flattenIntoImage: () => void,
	) {
		this.canvas.className = 'annotation-canvas';
		this.canvas.setAttribute('aria-hidden', 'true');
		this.#context = this.canvas.getContext('2d')!;
		viewport.addCanvasLayer(this.canvas);
		viewport.addStageLayer?.(this.#selectionOverlay.element);
		viewport.onViewChange?.(() => this.renderSelection());
		layers.onChange((_state, change) => this.onLayersChange(change));
		documentModel.onHistoryChange(() => {
			this.#renderCache.invalidate();
			this.render();
		});
		documentModel.registerCompositeRenderer((context) => {
			if (documentModel.layers.isVisible(CoreLayerId.Objects))
				renderAnnotations(context, documentModel.canvas, layers.state);
		});
		documentModel.layers.onChange(() => this.render());
		documentModel.onBeforeGeometryChange((change) => {
			if (change.kind === DocumentGeometryChangeKind.Crop)
				layers.translateAll({ x: -change.rect.x, y: -change.rect.y }, false);
			else if (change.kind === DocumentGeometryChangeKind.Rebase)
				layers.translateAll(change.delta, false);
			else this.flattenIntoImage();
		});
		documentModel.onDocumentChange((snapshot) =>
			this.onDocumentChange(snapshot.hasImage, snapshot.width, snapshot.height),
		);
	}

	/** How the current tool shows the selection: with handles, as a frame, or not at all. */
	setSelectionPresentation(presentation: SelectionPresentation): void {
		this.#selectionPresentation = presentation;
		this.renderSelection();
	}

	private onDocumentChange(hasImage: boolean, width: number, height: number): void {
		this.canvas.width = width;
		this.canvas.height = height;
		this.#renderCache.invalidate();
		this.#restoring = true;
		const saved = hasImage
			? this.documentModel.toolbarState<AnnotationSessionState | AnnotationStateInput>(
					LAYER_STATE_KEY,
				)
			: undefined;
		if (saved && 'state' in saved) this.layers.restoreSession(saved);
		else this.layers.restore(saved);
		this.#restoring = false;
		this.render();
	}

	private onLayersChange(change: AnnotationChangeKind): void {
		if (
			change === AnnotationChangeKind.Committed &&
			!this.#restoring &&
			this.documentModel.hasImage
		)
			this.documentModel.setToolbarState(
				LAYER_STATE_KEY,
				this.layers.snapshotSession(),
			);
		if (change === AnnotationChangeKind.Transient) {
			this.scheduleTransientRender();
			return;
		}
		this.cancelTransientRender();
		this.render();
	}

	private scheduleTransientRender(): void {
		if (this.#transientRenderFrame !== null) return;
		this.#transientRenderFrame = requestAnimationFrame(() => {
			this.#transientRenderFrame = null;
			this.render();
		});
	}

	private cancelTransientRender(): void {
		if (this.#transientRenderFrame === null) return;
		cancelAnimationFrame(this.#transientRenderFrame);
		this.#transientRenderFrame = null;
	}

	private render(): void {
		if (!this.documentModel.layers.isVisible(CoreLayerId.Objects)) {
			this.documentModel.setImagePresentedByComposite(false);
			this.#context.clearRect(0, 0, this.canvas.width, this.canvas.height);
			this.renderSelection(null);
			return;
		}
		const renderState = this.layers.renderState;
		const interactive = renderState.interactionActive
			? this.layers.object(renderState.changedObjectId)
			: null;
		const imageBackdrop =
			requiresImageBackdrop(this.layers.state.layers) &&
			this.documentModel.layers.isVisible(CoreLayerId.Image)
				? this.documentModel.canvas
				: null;
		this.documentModel.setImagePresentedByComposite(imageBackdrop !== null);
		this.#renderCache.render(
			this.#context,
			this.documentModel.canvas,
			this.layers.state,
			renderState,
			null,
			interactive,
			imageBackdrop,
		);
		this.renderSelection();
	}

	/** Shows the selected item's controls, or the frame around a whole selected layer. */
	private renderSelection(
		object: AnnotationObject | null = this.layers.selected,
	): void {
		const { width, height } = this.documentModel;
		const visualScale = this.visualScale();
		const layer = object ? null : this.layers.selectedLayer;
		if (layer) {
			this.#selectionOverlay.renderLayerFrame(
				this.layers.layerFrame(layer.id),
				width,
				height,
				visualScale,
				this.#selectionPresentation,
			);
			return;
		}
		const itemLayer = object ? this.layers.layerOf(object.id) : null;
		this.#selectionOverlay.render(
			object,
			width,
			height,
			visualScale,
			this.#selectionPresentation,
			itemLayer ? this.layers.layerFrame(itemLayer.id) : null,
		);
	}

	/** Document pixels per screen pixel, so handles keep their on-screen size. */
	private visualScale(): number {
		const screenWidth = this.documentModel.overlay.getBoundingClientRect().width;
		return Math.max(1, this.documentModel.width) / Math.max(1, screenWidth);
	}
}
