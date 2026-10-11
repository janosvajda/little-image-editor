import type { Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { type Gradient, inFrame, relativeToFrame } from '../../core/geometry/gradient';
import { pointInShapeFrame, withShapeTransform } from '../../core/geometry/shapeTransformHelpers';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderGradientHandles } from '../annotations/annotationRenderer';
import { AnnotationObjectTypeId, type AnnotationObject, type PathAnnotation, type ShapeAnnotation } from '../annotations/annotationTypes';
import type { DrawingGesture } from './gestures/drawingGesture';
import { PEN_NODE_REACH } from './penTool';

const GradientEnd = { Start: 'start', End: 'end' } as const;
type GradientEnd = (typeof GradientEnd)[keyof typeof GradientEnd];

type GradientFilled = (ShapeAnnotation | PathAnnotation) & { fillGradient: Gradient };

/**
 * While an item filled with a gradient is selected with Select, its
 * gradient's two points are shown on it: a linear gradient's start and end,
 * or a radial one's centre and edge. Dragging either reshapes the gradient,
 * in one undo step, and the points stay with the item as it moves or turns.
 */
export class GradientHandles {
	#active = false;
	#shown = false;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
		/** Whether something else, such as point editing, has the overlay now. */
		private readonly suppressed: () => boolean,
	) {
		objects.onChange(() => this.render());
	}

	/** Shown only with the tool that moves items, so drawing tools keep a clear canvas. */
	setActive(active: boolean): void {
		this.#active = active;
		this.render();
	}

	/** A press on one of the gradient's points starts dragging it; anywhere else it is not the gradient's. */
	begin(point: Point, visualScale: number): DrawingGesture | null {
		const item = this.item();
		if (!item) return null;
		const geometry = genericShape(item).geometry;
		const local = pointInShapeFrame(geometry, point);
		const reach = PEN_NODE_REACH * visualScale;
		const near = (relative: Point) => {
			const at = inFrame(geometry.rect, relative);
			return Math.hypot(at.x - local.x, at.y - local.y) <= reach;
		};
		const end: GradientEnd | null = near(item.fillGradient.start) ? GradientEnd.Start : near(item.fillGradient.end) ? GradientEnd.End : null;
		if (!end) return null;
		const restore = this.objects.createCheckpoint();
		const id = item.id;
		return {
			locksScroll: true,
			update: (moved) => {
				const relative = relativeToFrame(geometry.rect, pointInShapeFrame(geometry, moved));
				this.objects.update(
					id,
					(object) => {
						if (isGradientFilled(object)) object.fillGradient = { ...object.fillGradient, [end]: relative };
					},
					false,
				);
			},
			complete: () => this.objects.commitCurrent(),
			cancel: () => restore(),
		};
	}

	render(): void {
		const item = this.item();
		if (!item) {
			// Only clears what it drew, so a pen preview or point marks are left alone.
			if (this.#shown) this.documentModel.clearOverlay();
			this.#shown = false;
			return;
		}
		this.documentModel.clearOverlay();
		const geometry = genericShape(item).geometry;
		const context = this.documentModel.overlayContext;
		withShapeTransform(context, geometry, () =>
			renderGradientHandles(context, inFrame(geometry.rect, item.fillGradient.start), inFrame(geometry.rect, item.fillGradient.end)),
		);
		this.#shown = true;
	}

	/** The selected item whose gradient is shown, when the handles are wanted now. */
	private item(): GradientFilled | null {
		if (!this.#active || this.suppressed()) return null;
		const selected = this.objects.selected;
		return selected && isGradientFilled(selected) && selected.fill ? selected : null;
	}
}

function isGradientFilled(object: AnnotationObject): object is GradientFilled {
	return (object.type === AnnotationObjectTypeId.Shape || object.type === AnnotationObjectTypeId.Path) && object.fillGradient !== undefined;
}
