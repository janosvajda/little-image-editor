import { compositeLayer, compositeLayers } from '../layers/layerCompositing';
import { hasDefaultCompositing } from '../layers/layerAppearance';
import type { LayerMotion } from './annotationDocument';
import type {
	AnnotationObject,
	AnnotationState,
	ContentLayer,
} from './annotationTypes';

type DrawItem = (context: CanvasRenderingContext2D, item: AnnotationObject) => void;

/** One offscreen surface, created on first use and released when a drag ends. */
class PreviewSurface {
	#canvas: HTMLCanvasElement | null = null;
	#context: CanvasRenderingContext2D | null = null;

	get canvas(): HTMLCanvasElement | null {
		return this.#canvas;
	}

	/** A cleared context of the given size, or `null` where canvases cannot draw. */
	prepare(width: number, height: number): CanvasRenderingContext2D | null {
		this.#canvas ??= document.createElement('canvas');
		this.#context ??= this.#canvas.getContext('2d');
		if (this.#canvas.width !== width || this.#canvas.height !== height) {
			this.#canvas.width = width;
			this.#canvas.height = height;
		}
		this.#context?.clearRect(0, 0, width, height);
		return this.#context;
	}

	release(): void {
		if (!this.#canvas) return;
		this.#canvas.width = 0;
		this.#canvas.height = 0;
	}
}

/**
 * Renders a whole layer being dragged without redrawing its items on every
 * pointer move. When the drag starts, the content below the layer, the layer
 * itself (where it was before the drag) and the content above are drawn once;
 * each frame then shifts the layer by the drag rounded to whole pixels, so the
 * preview stays as sharp as a full redraw and matches it for whole-pixel drags. The
 * layer keeps its own opacity and blend mode against the content below.
 *
 * Content above is drawn on its own surface, so it is only previewed this way
 * when every layer above composites normally; otherwise the caller redraws.
 */
export class LayerMotionPreview {
	readonly #below = new PreviewSurface();
	readonly #layer = new PreviewSurface();
	readonly #above = new PreviewSurface();
	#layerId: string | null = null;
	#builds = 0;

	/** How often the surfaces were drawn; each drag should draw them once. */
	get builds(): number {
		return this.#builds;
	}

	canPreview(state: Readonly<AnnotationState>, layerId: string): boolean {
		const index = state.layers.findIndex((layer) => layer.id === layerId);
		return (
			index >= 0 &&
			state.layers
				.slice(index + 1)
				.every((layer) => layer.visible === false || hasDefaultCompositing(layer))
		);
	}

	/** Draws the frame for `motion`, building the surfaces when a new drag begins. */
	render(
		target: CanvasRenderingContext2D,
		state: Readonly<AnnotationState>,
		motion: LayerMotion,
		backdrop: HTMLCanvasElement | null,
		drawItem: DrawItem,
	): boolean {
		const layer = state.layers.find((candidate) => candidate.id === motion.layerId);
		if (!layer) return false;
		if (this.#layerId !== motion.layerId) {
			if (!this.build(target.canvas, state, layer, motion.offset, backdrop, drawItem))
				return false;
			this.#layerId = motion.layerId;
		}
		this.compose(target, layer, {
			x: Math.round(motion.offset.x),
			y: Math.round(motion.offset.y),
		});
		return true;
	}

	/** Ends a drag and frees the surfaces. */
	reset(): void {
		if (this.#layerId === null) return;
		this.#layerId = null;
		this.#below.release();
		this.#layer.release();
		this.#above.release();
	}

	private build(
		size: Readonly<{ width: number; height: number }>,
		state: Readonly<AnnotationState>,
		layer: ContentLayer,
		offset: Readonly<{ x: number; y: number }>,
		backdrop: HTMLCanvasElement | null,
		drawItem: DrawItem,
	): boolean {
		const below = this.#below.prepare(size.width, size.height);
		const moving = this.#layer.prepare(size.width, size.height);
		const above = this.#above.prepare(size.width, size.height);
		if (!below || !moving || !above) return false;
		const layerIndex = new Map(
			state.layers.flatMap((candidate, index) =>
				candidate.itemIds.map((id) => [id, index] as const),
			),
		);
		const movingIndex = state.layers.indexOf(layer);
		if (backdrop) below.drawImage(backdrop, 0, 0);
		compositeLayers(below, state, drawItem, (item) => (layerIndex.get(item.id) ?? 0) < movingIndex);
		compositeLayers(above, state, drawItem, (item) => (layerIndex.get(item.id) ?? 0) > movingIndex);
		// The moving layer is drawn plainly where it was before the drag, so each
		// frame shifts it by the whole drag; its opacity and blend apply when composed.
		moving.save();
		moving.translate(-offset.x, -offset.y);
		if (layer.visible !== false)
			for (const item of state.objects)
				if (layerIndex.get(item.id) === movingIndex && item.visible !== false)
					drawItem(moving, item);
		moving.restore();
		this.#builds += 1;
		return true;
	}

	private compose(
		target: CanvasRenderingContext2D,
		layer: ContentLayer,
		shift: Readonly<{ x: number; y: number }>,
	): void {
		const below = this.#below.canvas;
		const moving = this.#layer.canvas;
		const above = this.#above.canvas;
		if (!below || !moving || !above) return;
		target.clearRect(0, 0, target.canvas.width, target.canvas.height);
		target.drawImage(below, 0, 0);
		if (layer.visible !== false)
			compositeLayer(target, layer, (context) => context.drawImage(moving, shift.x, shift.y));
		target.drawImage(above, 0, 0);
	}
}
