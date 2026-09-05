import {
	type PaintTool,
	PaintToolId,
	type Point,
} from '../../../core/document/appTypes';
import type { CanvasDocument } from '../../../core/document/imageDocument';
import {
	drawFreehandStroke,
	pixelAlignedPoint,
	type StrokeOptions,
} from '../drawingHelpers';
import type { DrawingGesture } from './drawingGesture';

const POINTER_NUDGE = 0.01;
const RGBA_CHANNEL_COUNT = 4;
const OPAQUE_ALPHA = 255;

/** Paints directly into an ordinary flat image when no retained object is selected. */
export class BaseImagePaintGesture implements DrawingGesture {
	readonly coalesced = true;
	readonly locksScroll = true;
	readonly #before: ImageData;
	readonly #replacement: Uint8ClampedArray | null;
	#previous: Point;

	constructor(
		private readonly model: CanvasDocument,
		private readonly tool: PaintTool,
		private readonly options: StrokeOptions,
		point: Point,
		pressure: number,
	) {
		this.#before = model.context.getImageData(0, 0, model.width, model.height);
		this.#replacement =
			tool === PaintToolId.Eraser ? model.cropReplacementPixel() : null;
		this.#previous = this.paintPoint(point);
		this.update(
			{ x: point.x + POINTER_NUDGE, y: point.y + POINTER_NUDGE },
			pressure,
		);
	}

	update(point: Point, pressure: number): void {
		const next = this.paintPoint(point);
		drawFreehandStroke(
			this.model.context,
			this.tool,
			this.#previous,
			next,
			this.options,
			pressure,
		);
		if (this.tool === PaintToolId.Eraser && this.#replacement)
			this.restoreOpaqueBackground(this.#previous, next);
		this.#previous = next;
	}

	complete(): void {
		this.model.commit();
	}

	cancel(): void {
		this.model.context.putImageData(this.#before, 0, 0);
	}

	private paintPoint(point: Point): Point {
		return this.tool === PaintToolId.Pencil
			? pixelAlignedPoint(
					point,
					this.model.width,
					this.model.height,
					this.options.size,
				)
			: point;
	}

	private restoreOpaqueBackground(from: Point, to: Point): void {
		const replacement = this.#replacement;
		if (!replacement || replacement.length < RGBA_CHANNEL_COUNT) return;
		const padding = this.options.size;
		const left = Math.floor(Math.min(from.x, to.x) - padding);
		const top = Math.floor(Math.min(from.y, to.y) - padding);
		const right = Math.ceil(Math.max(from.x, to.x) + padding);
		const bottom = Math.ceil(Math.max(from.y, to.y) + padding);
		this.model.context.save();
		this.model.context.globalCompositeOperation = 'destination-over';
		this.model.context.fillStyle = `rgba(${replacement[0]}, ${replacement[1]}, ${replacement[2]}, ${(replacement[3] ?? OPAQUE_ALPHA) / OPAQUE_ALPHA})`;
		this.model.context.fillRect(left, top, right - left, bottom - top);
		this.model.context.restore();
	}
}
