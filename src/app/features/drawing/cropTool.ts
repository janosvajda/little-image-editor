import type { CropRect, Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { normalizedRect } from '../../core/geometry/geometryHelpers';
import { CoreLayerId, LayerKind } from '../../core/layers/layerTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import { createRasterFragmentItem } from '../annotations/paintLayerFactory';
import { LinkedHistoryDomain } from '../annotations/annotationTypes';
import { CanvasCopyMode, copyCanvas } from '../files/canvasHelpers';
import type { CanvasViewportController } from '../workspace/canvasViewportController';
import { BaseImageCropSelection } from './baseImageCropSelection';
import { CropSelectionOverlay } from './cropSelectionOverlay';
import { CropSelectionKind } from './cropSelectionTypes';
import {
	drawingLayerTargetAt,
	isDrawingLayerTargetEditable,
	type DrawingLayerTarget,
} from './drawingLayerTarget';
import type { DrawingGesture } from './gestures/drawingGesture';
import { extractPixelFragment } from './pixelCutMove';

const MINIMUM_POLYGON_POINTS = 3;

interface CropDraft {
	readonly start: Point;
	readonly kind: CropSelectionKind;
	readonly target: DrawingLayerTarget | null;
	readonly restore: (() => void) | undefined;
	points: Point[];
}

/** Crop selection, extraction and linked history. No toolbar or pointer-event ownership. */
export class CropTool implements DrawingGesture {
	readonly locksScroll = true;
	readonly #overlay = new CropSelectionOverlay();
	#draft: CropDraft | null = null;
	readonly #baseSelection: BaseImageCropSelection;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly shapes?: AnnotationDocument,
		private readonly viewport?: CanvasViewportController,
	) {
		this.#baseSelection = new BaseImageCropSelection(documentModel, (points) =>
			this.render(points),
		);
		viewport?.addStageLayer?.(this.#overlay.element);
		viewport?.onViewChange?.(() =>
			this.#overlay.refreshZoom(viewport.zoom ?? 1),
		);
	}

	containsSelection(point: Point): boolean {
		return this.#baseSelection.contains(point);
	}

	beginMove(point: Point): DrawingGesture | null {
		return this.#baseSelection.begin(point);
	}

	begin(point: Point, kind: CropSelectionKind): DrawingGesture {
		this.#baseSelection.clear();
		this.#draft = {
			start: point,
			kind,
			points: [point],
			target: drawingLayerTargetAt(
				this.documentModel,
				this.shapes,
				point,
				this.shapes?.selectedId,
			),
			restore: this.shapes?.createCheckpoint(),
		};
		this.shapes?.clearSelection();
		return this;
	}

	update(point: Point): void {
		const draft = this.#draft;
		if (!draft) return;
		if (draft.kind === CropSelectionKind.Lasso) {
			const previous = draft.points.at(-1);
			if (!previous || previous.x !== point.x || previous.y !== point.y)
				draft.points.push(point);
		} else draft.points = rectanglePoints(normalizedRect(draft.start, point));
		this.render(draft.points);
	}

	complete(point: Point): void {
		this.update(point);
		const draft = this.#draft;
		const selection = draft?.points;
		this.#draft = null;
		this.render(null);
		if (
			selection &&
			selection.length >= MINIMUM_POLYGON_POINTS &&
			draft?.target
		)
			this.extractSelection(selection, draft.target);
	}

	cancel(): void {
		this.#draft?.restore?.();
		this.#draft = null;
		this.#baseSelection.clear();
	}

	private render(points: readonly Point[] | null): void {
		this.#overlay.render(
			points,
			this.documentModel.width,
			this.documentModel.height,
			this.viewport?.zoom ?? 1,
		);
	}

	private extractSelection(
		selection: readonly Point[],
		target: DrawingLayerTarget,
	): boolean {
		if (!isDrawingLayerTargetEditable(this.documentModel, this.shapes, target))
			return false;
		const shapes = this.shapes;
		// CanvasDocument-only clients retain their existing bitmap selection workflow.
		if (!shapes) {
			this.#baseSelection.select(selection);
			return true;
		}
		if (!this.documentModel.layers.isEditable(CoreLayerId.Objects))
			return false;
		const surface =
			target.kind === LayerKind.Raster
				? copyCanvas(this.documentModel.canvas, CanvasCopyMode.Pixels)
				: this.objectSurface(target.objectId);
		const context = surface?.getContext('2d');
		if (!surface || !context) return false;
		const pixels = extractPixelFragment(
			context,
			surface.width,
			surface.height,
			selection,
		);
		if (!pixels) return false;
		const fragment = createRasterFragmentItem(pixels);
		if (target.kind === LayerKind.Objects) {
			if (
				shapes.cutToRasterFragment(target.objectId, selection, fragment) ===
				null
			)
				return false;
		} else {
			// Cutting image pixels and creating their layer form one linked undo step.
			this.documentModel.context.clearRect(0, 0, surface.width, surface.height);
			this.documentModel.context.drawImage(surface, 0, 0);
			this.documentModel.commit();
			shapes.activate(null);
			shapes.add(fragment, true, LinkedHistoryDomain.Document);
		}
		this.documentModel.layers.select(CoreLayerId.Objects);
		return true;
	}

	private objectSurface(objectId: string): HTMLCanvasElement | null {
		const object = this.shapes?.object(objectId);
		if (!object) return null;
		const surface = document.createElement('canvas');
		surface.width = this.documentModel.width;
		surface.height = this.documentModel.height;
		const context = surface.getContext('2d');
		if (!context) return null;
		renderAnnotationObject(context, this.documentModel.canvas, object);
		return surface;
	}
}

function rectanglePoints(rect: CropRect): Point[] {
	return [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.width, y: rect.y },
		{ x: rect.x + rect.width, y: rect.y + rect.height },
		{ x: rect.x, y: rect.y + rect.height },
	];
}
