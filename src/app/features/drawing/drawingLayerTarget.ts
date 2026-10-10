import type { Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId, LayerKind } from '../../core/layers/layerTypes';
import {
	AnnotationHitTestScope,
	type AnnotationDocument,
} from '../annotations/annotationDocument';

export type DrawingLayerTarget =
	| Readonly<{
			kind: typeof LayerKind.Raster;
			layerId: typeof CoreLayerId.Image;
	  }>
	| Readonly<{
			kind: typeof LayerKind.Objects;
			layerId: string;
			objectId: string;
	  }>;

/** Resolves one source beneath the pointer without editing through visible locked content. */
export function drawingLayerTargetAt(
	documentModel: CanvasDocument,
	objects: AnnotationDocument | undefined,
	point: Point,
	preferredObjectId: string | null = null,
): DrawingLayerTarget | null {
	if (documentModel.layers.isVisible(CoreLayerId.Objects) && objects) {
		const preferred =
			preferredObjectId &&
			objects.containsObjectPoint(
				preferredObjectId,
				point,
				AnnotationHitTestScope.Visible,
			)
				? objects.object(preferredObjectId)
				: null;
		const hit =
			preferred ??
			objects.hitTest(point, undefined, AnnotationHitTestScope.Visible);
		const layer = hit ? objects.layerOf(hit.id) : null;
		if (hit && layer) {
			const target: DrawingLayerTarget = {
				kind: LayerKind.Objects,
				layerId: layer.id,
				objectId: hit.id,
			};
			return isDrawingLayerTargetEditable(documentModel, objects, target)
				? target
				: null;
		}
	}
	const image: DrawingLayerTarget = {
		kind: LayerKind.Raster,
		layerId: CoreLayerId.Image,
	};
	return isDrawingLayerTargetEditable(documentModel, objects, image)
		? image
		: null;
}

export function isDrawingLayerTargetEditable(
	documentModel: CanvasDocument,
	objects: AnnotationDocument | undefined,
	target: DrawingLayerTarget,
): boolean {
	return target.kind === LayerKind.Raster
		? documentModel.layers.isEditable(target.layerId)
		: documentModel.layers.isEditable(CoreLayerId.Objects) &&
				objects?.isEditable(target.objectId) === true;
}
