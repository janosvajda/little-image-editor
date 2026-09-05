import type { PaintTool, Point } from '../../core/document/appTypes';
import type { RasterFragmentAnnotation } from '../annotations/annotationTypes';
import { RasterFragmentSurface } from '../annotations/rasterFragmentSurface';
import { encodePixelBytes } from '../../shared/image/pixelDataCodec';
import { degreesToRadians } from '../../shared/math/numericConstants';
import { drawFreehandStroke, type StrokeOptions } from './drawingHelpers';

/** Paints through the fragment's inverse transform into its existing pixel storage. */
export class RasterPaintGesture {
	readonly #canvas: HTMLCanvasElement;
	readonly #context: CanvasRenderingContext2D;
	#last: Point;

	constructor(
		readonly objectId: string,
		object: RasterFragmentAnnotation,
		private readonly tool: PaintTool,
		private readonly options: StrokeOptions,
		start: Point,
	) {
		const surface = new RasterFragmentSurface(object);
		this.#canvas = surface.canvas;
		this.#context = surface.context;
		const { rect } = object;
		this.#context.translate(object.pixelWidth / 2, object.pixelHeight / 2);
		this.#context.scale(
			object.pixelWidth / rect.width,
			object.pixelHeight / rect.height,
		);
		this.#context.rotate(-degreesToRadians(object.rotation ?? 0));
		this.#context.translate(
			-(rect.x + rect.width / 2),
			-(rect.y + rect.height / 2),
		);
		this.#last = start;
	}

	append(point: Point, pressure: number): void {
		drawFreehandStroke(
			this.#context,
			this.tool,
			this.#last,
			point,
			this.options,
			pressure,
		);
		this.#last = point;
	}

	apply(object: RasterFragmentAnnotation): void {
		object.pixels = encodePixelBytes(
			this.#context.getImageData(0, 0, this.#canvas.width, this.#canvas.height)
				.data,
		);
		object.erasures = undefined;
		object.erasureRevision = undefined;
		object.pixelCutouts = undefined;
		object.pixelClips = undefined;
	}
}
