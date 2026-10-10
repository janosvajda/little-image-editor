import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	renderAnnotationObject,
	renderAnnotations,
} from '../annotations/annotationRenderer';
import {
	type ContentLayer,
	LinkedHistoryDomain,
} from '../annotations/annotationTypes';
import { createRasterFragmentItem } from '../annotations/paintLayerFactory';
import { copyCanvas } from '../files/canvasHelpers';
import { opaquePixelFragment } from '../drawing/pixelCutMove';
import { hasDefaultCompositing } from './layerAppearance';
import { compositeLayer } from './layerCompositing';

/**
 * Merge Down. Between two normally composited layers the items simply move
 * into the lower layer and stay editable. When either layer has its own
 * opacity or blend mode, the result is baked into one pixel item so it looks
 * the same. Merging the bottom layer writes it into the image.
 */
export class LayerMerger {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
	) {}

	canMergeDown(layerId: string): boolean {
		if (!this.objects.isLayerEditable(layerId)) return false;
		const below = this.objects.layerBelow(layerId);
		return below
			? this.objects.isLayerEditable(below.id)
			: this.documentModel.layers.isEditable(CoreLayerId.Image);
	}

	mergeDown(layerId: string): boolean {
		const upper = this.objects.layer(layerId);
		if (!upper || !this.canMergeDown(layerId)) return false;
		const below = this.objects.layerBelow(layerId);
		if (!below) this.mergeIntoImage(upper);
		else if (hasDefaultCompositing(upper) && hasDefaultCompositing(below))
			this.objects.mergeItemsDown(layerId);
		else this.bakeInto(upper, below);
		return true;
	}

	canFlatten(): boolean {
		return (
			this.objects.state.objects.length > 0 &&
			this.documentModel.layers.isEditable(CoreLayerId.Image)
		);
	}

	/** Bakes every visible layer into the image and removes the layers, as one undo step. */
	flatten(): boolean {
		if (!this.canFlatten()) return false;
		this.drawLayersIntoImage();
		this.documentModel.commit();
		this.objects.clear(LinkedHistoryDomain.Document);
		return true;
	}

	/**
	 * Bakes the layers into the image just before the image is resized or
	 * turned; that operation records the step, and the layers start afresh.
	 */
	flattenBeforeGeometryChange(): void {
		if (this.objects.state.objects.length === 0) return;
		this.drawLayersIntoImage();
		this.objects.restore();
	}

	/** Layers blend against the image, so they are composited over a copy of it. */
	private drawLayersIntoImage(): void {
		const { canvas, context } = this.documentModel;
		const flattened = copyCanvas(canvas);
		renderAnnotations(flattened.getContext('2d')!, canvas, this.objects.state);
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(flattened, 0, 0);
	}

	private mergeIntoImage(upper: ContentLayer): void {
		const { canvas, context } = this.documentModel;
		const merged = copyCanvas(canvas);
		this.compositeOnto(merged, upper, upper);
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(merged, 0, 0);
		this.documentModel.commit();
		this.objects.removeLayer(upper.id, LinkedHistoryDomain.Document);
	}

	/** The lower layer keeps its name and appearance; the upper one is baked in with its own. */
	private bakeInto(upper: ContentLayer, below: ContentLayer): void {
		const { canvas } = this.documentModel;
		const surface = document.createElement('canvas');
		surface.width = canvas.width;
		surface.height = canvas.height;
		const context = surface.getContext('2d');
		if (!context) return;
		this.compositeOnto(surface, below, null);
		this.compositeOnto(surface, upper, upper);
		const pixels = opaquePixelFragment(context, surface.width, surface.height);
		if (pixels)
			this.objects.mergeLayersInto(
				below.id,
				upper.id,
				createRasterFragmentItem(pixels),
			);
		else this.objects.removeLayer(upper.id);
	}

	/** Draws a layer's visible items onto a surface, composited as `appearance` (or plainly). */
	private compositeOnto(
		surface: HTMLCanvasElement,
		layer: ContentLayer,
		appearance: ContentLayer | null,
	): void {
		const context = surface.getContext('2d');
		if (!context || layer.visible === false) return;
		const items = this.objects
			.layerItems(layer.id)
			.filter((item) => item.visible !== false);
		compositeLayer(context, appearance, (layerContext) => {
			for (const item of items)
				renderAnnotationObject(layerContext, this.documentModel.canvas, item);
		});
	}
}
