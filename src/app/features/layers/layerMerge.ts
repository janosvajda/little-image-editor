import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import {
	type AnnotationObject,
	LinkedHistoryDomain,
} from '../annotations/annotationTypes';
import {
	createPaintLayer,
	createRasterFragmentLayer,
} from '../annotations/paintLayerFactory';
import { copyCanvas } from '../files/canvasHelpers';
import { opaquePixelFragment } from '../drawing/pixelCutMove';
import { compositeLayer } from './layerCompositing';

/**
 * Merge Down: bakes a layer, with its opacity and blend mode, into
 * the layer beneath it. The lower layer keeps its name and appearance; merging
 * the bottom layer writes into the image.
 */
export class LayerMerger {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
	) {}

	canMergeDown(id: string): boolean {
		const index = this.indexOf(id);
		if (index === null || !this.objects.isEditable(id)) return false;
		const below = this.objects.state.objects[index - 1];
		return below
			? this.objects.isEditable(below.id)
			: this.documentModel.layers.isEditable(CoreLayerId.Image);
	}

	mergeDown(id: string): boolean {
		if (!this.canMergeDown(id)) return false;
		const index = this.indexOf(id)!;
		const layers = this.objects.state.objects;
		const upper = layers[index]!;
		const below = layers[index - 1];
		if (below) this.mergeIntoLayer(upper, below);
		else this.mergeIntoImage(upper);
		return true;
	}

	private mergeIntoImage(upper: AnnotationObject): void {
		const { canvas, context } = this.documentModel;
		const merged = copyCanvas(canvas);
		this.compositeOnto(merged, upper);
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(merged, 0, 0);
		this.documentModel.commit();
		this.objects.remove(upper.id, LinkedHistoryDomain.Document);
	}

	private mergeIntoLayer(upper: AnnotationObject, below: AnnotationObject): void {
		const { canvas } = this.documentModel;
		const surface = document.createElement('canvas');
		surface.width = canvas.width;
		surface.height = canvas.height;
		const context = surface.getContext('2d');
		if (!context) return;
		renderAnnotationObject(context, canvas, below);
		this.compositeOnto(surface, upper);
		const pixels = opaquePixelFragment(context, surface.width, surface.height);
		const merged = pixels ? createRasterFragmentLayer(pixels) : createPaintLayer();
		this.objects.replaceLayers([below.id, upper.id], {
			...merged,
			name: this.objects.layerName(below.id),
			...layerState(below),
		});
	}

	private compositeOnto(surface: HTMLCanvasElement, layer: AnnotationObject): void {
		const context = surface.getContext('2d');
		if (!context) return;
		compositeLayer(context, layer, (layerContext) =>
			renderAnnotationObject(layerContext, this.documentModel.canvas, layer),
		);
	}

	private indexOf(id: string): number | null {
		const index = this.objects.state.objects.findIndex((object) => object.id === id);
		return index < 0 ? null : index;
	}
}

/** The lower layer's own compositing and state carry over to the merged layer. */
function layerState(
	layer: AnnotationObject,
): Pick<AnnotationObject, 'layerOpacity' | 'blendMode' | 'visible' | 'locked'> {
	return {
		...(layer.layerOpacity === undefined ? {} : { layerOpacity: layer.layerOpacity }),
		...(layer.blendMode === undefined ? {} : { blendMode: layer.blendMode }),
		...(layer.visible === undefined ? {} : { visible: layer.visible }),
		...(layer.locked === undefined ? {} : { locked: layer.locked }),
	};
}
