import type { Point } from '../../../core/document/appTypes';
import { genericShape } from '../../../core/geometry/genericShape';
import {
	DEFAULT_SHAPE_INTERACTION,
	type RotationDrag,
} from '../../../core/geometry/shapeInteraction';
import {
	mapGeometryBetweenFrames,
	type ShapeHandle,
	ShapeHandleId,
	type TransformableGeometry,
} from '../../../core/geometry/shapeTransformHelpers';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import {
	type GestureModifiers,
	POINTER_DRAG_THRESHOLD,
	RetainedDrawingGesture,
} from './drawingGesture';

/** A whole-layer drag: move from inside the frame, or a handle of the frame. */
export type LayerTransformIntent = ShapeHandle | null;

/**
 * Moves (by whole pixels), resizes or rotates a whole layer through its frame, which turns with
 * the layer and keeps that rotation. Each update maps
 * every item from where it started into the transformed frame, so repeated
 * pointer moves never accumulate rounding. A click without dragging selects
 * the item under the pointer instead, if any.
 */
export class LayerTransformGesture extends RetainedDrawingGesture {
	readonly #startFrame: TransformableGeometry;
	readonly #startGeometries: ReadonlyMap<string, TransformableGeometry>;
	#dragging = false;
	/** How far a move has taken the layer, in whole pixels, so its items stay pixel-exact. */
	#moved: Point = { x: 0, y: 0 };

	constructor(
		objects: AnnotationDocument,
		private readonly layerId: string,
		frame: TransformableGeometry,
		private readonly start: Point,
		private readonly handle: LayerTransformIntent,
		private readonly clickTargetId: string | null,
	) {
		super(objects);
		this.#startFrame = { rect: { ...frame.rect }, rotation: frame.rotation ?? 0 };
		this.#startGeometries = new Map(
			objects.layerItems(layerId).map((item) => [item.id, genericShape(item).geometry]),
		);
	}

	update(point: Point, _pressure?: number, modifiers?: GestureModifiers): void {
		this.#dragging ||=
			Math.hypot(point.x - this.start.x, point.y - this.start.y) >=
			POINTER_DRAG_THRESHOLD;
		// A move follows the pointer at once, like an item move; a click restores it.
		if (this.handle === null) {
			this.moveTo(point);
			return;
		}
		if (!this.#dragging) return;
		const frame = this.frameAt(point, modifiers);
		this.objects.transformLayer(
			this.layerId,
			frame.rotation ?? 0,
			(item) => {
				const start = this.#startGeometries.get(item.id);
				if (start)
					genericShape(item).setGeometry(
						mapGeometryBetweenFrames(start, this.#startFrame, frame),
					);
			},
			false,
		);
	}

	override complete(point: Point): void {
		if (this.#dragging) {
			super.complete(point);
			return;
		}
		this.cancel();
		if (this.clickTargetId) this.objects.select(this.clickTargetId);
	}

	/** Moves the layer with the pointer, by whole pixels. */
	private moveTo(point: Point): void {
		const moved = {
			x: Math.round(point.x - this.start.x),
			y: Math.round(point.y - this.start.y),
		};
		if (moved.x === this.#moved.x && moved.y === this.#moved.y) return;
		this.objects.moveLayer(
			this.layerId,
			{ x: moved.x - this.#moved.x, y: moved.y - this.#moved.y },
			false,
		);
		this.#moved = moved;
	}

	/** The frame after a resize or rotate drag to `point`. */
	private frameAt(
		point: Point,
		modifiers: GestureModifiers | undefined,
	): TransformableGeometry {
		const frame: TransformableGeometry = {
			rect: { ...this.#startFrame.rect },
			rotation: this.#startFrame.rotation,
		};
		if (this.handle === null) return frame;
		const rotation: RotationDrag | undefined =
			this.handle === ShapeHandleId.Rotate
				? {
						origin: { pointer: this.start, rotation: this.#startFrame.rotation ?? 0 },
						constrained: modifiers?.constrained ?? false,
					}
				: undefined;
		DEFAULT_SHAPE_INTERACTION.transform(frame, this.handle, point, rotation);
		return frame;
	}
}
