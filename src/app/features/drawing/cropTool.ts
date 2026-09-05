import {
	DocumentType,
	type CropRect,
	type Point,
} from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { normalizedRect } from '../../core/geometry/geometryHelpers';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { encodePixelBytes } from '../../shared/image/pixelDataCodec';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	LinkedHistoryDomain,
	type RasterFragmentAnnotation,
} from '../annotations/annotationTypes';
import type { CanvasViewportController } from '../workspace/canvasViewportController';
import { BaseImageCropSelection } from './baseImageCropSelection';
import { CropSelectionOverlay } from './cropSelectionOverlay';
import { CropSelectionKind } from './cropSelectionTypes';
import type { DrawingGesture } from './gestures/drawingGesture';
import {
	type ExtractedPixelFragment,
	extractPixelFragment,
} from './pixelCutMove';

const MINIMUM_POLYGON_POINTS = 3;

interface CropDraft {
	readonly start: Point;
	readonly kind: CropSelectionKind;
	readonly targetId: string | null;
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
			targetId: this.shapes?.selectedId ?? null,
		};
		this.shapes?.select(null);
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
		if (selection && selection.length >= MINIMUM_POLYGON_POINTS)
			this.extractSelection(selection, draft?.targetId ?? null);
	}

	cancel(): void {
		if (this.#draft) this.shapes?.select(this.#draft.targetId);
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
		targetId: string | null,
	): boolean {
		if (this.documentModel.documentType === DocumentType.Image) {
			if (!this.documentModel.layers.isEditable(CoreLayerId.Image)) return false;
			this.shapes?.select(null);
			this.documentModel.layers.select(CoreLayerId.Image);
			this.#baseSelection.select(selection);
			return true;
		}
		if (
			this.shapes &&
			this.documentModel.layers.isEditable(CoreLayerId.Objects)
		) {
			const extractionCanvas = document.createElement('canvas');
			extractionCanvas.width = this.documentModel.width;
			extractionCanvas.height = this.documentModel.height;
			const context = extractionCanvas.getContext('2d');
			if (!context) return false;
			for (const target of this.cropCandidates(selection, targetId)) {
				context.clearRect(
					0,
					0,
					extractionCanvas.width,
					extractionCanvas.height,
				);
				renderAnnotationObject(context, this.documentModel.canvas, target);
				const fragment = extractPixelFragment(
					context,
					extractionCanvas.width,
					extractionCanvas.height,
					selection,
				);
				if (
					fragment &&
					this.shapes.cutToRasterFragment(
						target.id,
						selection,
						this.createRasterFragment(fragment),
					)
				)
					return true;
			}
		}
		return this.extractBaseImageSelection(selection);
	}

	private extractBaseImageSelection(selection: readonly Point[]): boolean {
		if (
			!this.shapes ||
			!this.documentModel.layers.isEditable(CoreLayerId.Image)
		)
			return false;
		const fragment = extractPixelFragment(
			this.documentModel.context,
			this.documentModel.width,
			this.documentModel.height,
			selection,
			this.documentModel.cropReplacementPixel() ?? undefined,
		);
		if (!fragment) return false;
		this.documentModel.commit();
		this.documentModel.layers.select(CoreLayerId.Objects);
		this.shapes.add(
			this.createRasterFragment(fragment),
			true,
			LinkedHistoryDomain.Document,
		);
		return true;
	}

	private cropCandidates(
		selection: readonly Point[],
		targetId: string | null,
	): AnnotationObject[] {
		if (!this.shapes) return [];
		const bounds = pointBounds(selection);
		const selected = this.shapes.object(targetId);
		const selectedCandidate =
			selected &&
			this.shapes.isEditable(selected.id) &&
			rectanglesIntersect(genericShape(selected).geometry.rect, bounds)
				? selected
				: null;
		const candidates = [...this.shapes.state.objects]
			.reverse()
			.filter(
				(object) =>
					object.id !== selectedCandidate?.id &&
					this.shapes?.isEditable(object.id) &&
					rectanglesIntersect(genericShape(object).geometry.rect, bounds),
			);
		return selectedCandidate ? [selectedCandidate, ...candidates] : candidates;
	}

	private createRasterFragment(
		fragment: ExtractedPixelFragment,
	): RasterFragmentAnnotation {
		return {
			id: crypto.randomUUID(),
			type: AnnotationObjectTypeId.RasterFragment,
			rect: {
				x: fragment.bounds.left,
				y: fragment.bounds.top,
				width: fragment.bounds.width,
				height: fragment.bounds.height,
			},
			pixelWidth: fragment.bounds.width,
			pixelHeight: fragment.bounds.height,
			pixels: encodePixelBytes(fragment.pixels),
			rotation: 0,
		};
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

function pointBounds(points: readonly Point[]): CropRect {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		left = Math.min(left, point.x);
		top = Math.min(top, point.y);
		right = Math.max(right, point.x);
		bottom = Math.max(bottom, point.y);
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function rectanglesIntersect(left: CropRect, right: CropRect): boolean {
	return (
		left.x < right.x + right.width &&
		left.x + left.width > right.x &&
		left.y < right.y + right.height &&
		left.y + left.height > right.y
	);
}
