import type { CropRect, Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { genericShape } from '../../core/geometry/genericShape';
import {
	framePixelTest,
	type TransformableGeometry,
} from '../../core/geometry/shapeTransformHelpers';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';
import {
	createFloodFillMask,
	floodFill,
	type FloodFillOptions,
	type FloodFillRegion,
	type FloodFillRun,
} from './floodFillHelpers';

const HEX_RADIX = 16;
const HEX_CHANNEL_WIDTH = 2;

/** Immediate image actions, independent of toolbar presentation and gesture state. */
export class DrawingImageActions {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly shapes?: AnnotationDocument,
	) {}

	private fillScope(shapes: AnnotationDocument): FillScope {
		const item = shapes.selected;
		const itemLayer = item ? shapes.layerOf(item.id) : null;
		if (item && itemLayer && shapes.isEditable(item.id))
			return {
				walls: this.wallsOf([item]),
				region: frameRegion(genericShape(item).geometry),
				place: (fill) =>
					shapes.insertItem(fill, itemLayer.id, itemLayer.itemIds.indexOf(item.id)),
			};
		const layer = shapes.selectedLayer;
		const frame = layer ? shapes.layerFrame(layer.id) : null;
		if (layer && frame && shapes.isLayerEditable(layer.id))
			return {
				walls: this.wallsOf(
					shapes.layerItems(layer.id).filter((candidate) => candidate.visible !== false),
				),
				region: frameRegion(frame),
				place: (fill) => shapes.insertItem(fill, layer.id, 0),
			};
		return {
			walls: this.documentModel.compositeCanvas(),
			place: (fill) => shapes.add(fill),
		};
	}

	/** A canvas holding only the given items, whose lines act as the fill's walls. */
	private wallsOf(items: readonly AnnotationObject[]): HTMLCanvasElement {
		const walls = document.createElement('canvas');
		walls.width = this.documentModel.width;
		walls.height = this.documentModel.height;
		const context = walls.getContext('2d')!;
		for (const item of items)
			renderAnnotationObject(context, this.documentModel.canvas, item);
		return walls;
	}

	sampleColor(point: Point): string {
		const x = Math.max(
			0,
			Math.min(this.documentModel.width - 1, Math.floor(point.x)),
		);
		const y = Math.max(
			0,
			Math.min(this.documentModel.height - 1, Math.floor(point.y)),
		);
		const pixel = this.documentModel.context.getImageData(x, y, 1, 1).data;
		return `#${[pixel[0], pixel[1], pixel[2]].map((value) => value!.toString(HEX_RADIX).padStart(HEX_CHANNEL_WIDTH, '0')).join('')}`;
	}

	fillAt(point: Point, options: FloodFillOptions): void {
		const x = Math.max(
			0,
			Math.min(this.documentModel.width - 1, Math.floor(point.x)),
		);
		const y = Math.max(
			0,
			Math.min(this.documentModel.height - 1, Math.floor(point.y)),
		);
		if (this.shapes) {
			const scope = this.fillScope(this.shapes);
			const runs = createFloodFillMask(
				scope.walls.getContext('2d')!,
				this.documentModel.width,
				this.documentModel.height,
				x,
				y,
				options,
				scope.region,
			);
			if (runs.length === 0) return;
			scope.place({
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
}

/**
 * Where a fill may spread, what stops it, and where it is kept. A selected
 * item or whole layer limits the fill to its frame, only its own lines stop
 * it, and the fill goes beneath those lines. Without a selection, everything
 * visible stops the fill and it goes on top of the active layer.
 */
interface FillScope {
	readonly walls: HTMLCanvasElement;
	readonly region?: FloodFillRegion;
	place(fill: AnnotationObject): void;
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

function frameRegion(frame: TransformableGeometry): FloodFillRegion {
	return { contains: framePixelTest(frame) };
}
