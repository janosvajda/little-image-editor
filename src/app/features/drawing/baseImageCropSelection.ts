import type { Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import type { DrawingGesture } from './gestures/drawingGesture';
import { extractPixelFragment } from './pixelCutMove';

/** Transient pixel selection. Completed moves live in the image's existing history. */
export class BaseImageCropSelection {
	#points: readonly Point[] | null = null;
	#committing = false;

	constructor(
		private readonly model: CanvasDocument,
		private readonly render: (points: readonly Point[] | null) => void,
	) {
		model.onHistoryChange(() => {
			if (!this.#committing) this.clear();
		});
		model.onDocumentChange(() => this.clear());
	}

	select(points: readonly Point[]): void {
		this.#points = points.map((point) => ({ ...point }));
		this.render(this.#points);
	}

	clear(): void {
		this.#points = null;
		this.render(null);
	}

	contains(point: Point): boolean {
		const points = this.#points;
		if (!points?.length || !this.model.layers.isEditable(CoreLayerId.Image))
			return false;
		const path = new Path2D();
		path.moveTo(points[0]!.x, points[0]!.y);
		for (const vertex of points.slice(1)) path.lineTo(vertex.x, vertex.y);
		path.closePath();
		return this.model.context.isPointInPath(path, point.x, point.y, 'evenodd');
	}

	begin(point: Point): DrawingGesture | null {
		if (!this.contains(point) || !this.#points) return null;
		const points = this.#points;
		const before = this.model.context.getImageData(
			0,
			0,
			this.model.width,
			this.model.height,
		);
		const background = document.createElement('canvas');
		background.width = this.model.width;
		background.height = this.model.height;
		const context = background.getContext('2d');
		if (!context) return null;
		context.putImageData(before, 0, 0);
		const fragment = extractPixelFragment(
			context,
			background.width,
			background.height,
			points,
			this.model.cropReplacementPixel() ?? undefined,
		);
		if (!fragment) return null;
		const pixels = document.createElement('canvas');
		pixels.width = fragment.bounds.width;
		pixels.height = fragment.bounds.height;
		const pixelContext = pixels.getContext('2d');
		if (!pixelContext) return null;
		pixelContext.putImageData(
			new ImageData(
				new Uint8ClampedArray(fragment.pixels),
				pixels.width,
				pixels.height,
			),
			0,
			0,
		);
		const update = (destination: Point): Point => {
			const offset = {
				x: Math.round(destination.x - point.x),
				y: Math.round(destination.y - point.y),
			};
			this.model.context.putImageData(before, 0, 0);
			if (offset.x !== 0 || offset.y !== 0) {
				this.model.context.clearRect(0, 0, background.width, background.height);
				this.model.context.drawImage(background, 0, 0);
				this.model.context.drawImage(
					pixels,
					fragment.bounds.left + offset.x,
					fragment.bounds.top + offset.y,
				);
			}
			this.select(
				points.map((vertex) => ({
					x: vertex.x + offset.x,
					y: vertex.y + offset.y,
				})),
			);
			return offset;
		};
		return {
			locksScroll: true,
			update,
			complete: (destination) => {
				const offset = update(destination);
				if (offset.x === 0 && offset.y === 0) return;
				this.#committing = true;
				try {
					this.model.commit();
				} finally {
					this.#committing = false;
				}
			},
			cancel: () => {
				this.model.context.putImageData(before, 0, 0);
				this.select(points);
			},
		};
	}
}
