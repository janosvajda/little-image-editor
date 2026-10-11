import type { Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { PathContour, PathNode } from '../../core/geometry/vectorPath';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderAnnotationObject, renderPathNodes } from '../annotations/annotationRenderer';
import { AnnotationObjectTypeId, LineDash, type PathAnnotation } from '../annotations/annotationTypes';
import { LineEnd, type LineEnds } from '../annotations/lineEnd';
import type { StrokeOptions } from './drawingHelpers';
import { type DrawingGesture, POINTER_DRAG_THRESHOLD } from './gestures/drawingGesture';
import { ShapeStyle, styledFields } from '../annotations/shapeStyle';

/** How a path being drawn looks: its line, whether it is filled once closed, and its ends. */
export interface PenStyle {
	readonly stroke: StrokeOptions;
	/** Outline, fill, or both, once the path is closed. */
	readonly shapeStyle: ShapeStyle;
	/** What a filled path is filled with, inside its line. */
	readonly fillColor: string;
	readonly ends: LineEnds;
}

/** How near, in screen pixels, a press must be to a node to close the path on it or to pick it. */
export const PEN_NODE_REACH = 8;
const DRAFT_ID = 'pen-draft';
const MINIMUM_NODES = 2;
const HALF = 2;

/** How the tool draws its pieces: the Pen drags out curves, the Polyline keeps every piece straight. */
export const PenPieces = { Curves: 'curves', Straight: 'straight' } as const;
export type PenPieces = (typeof PenPieces)[keyof typeof PenPieces];

/**
 * The Pen: each press adds a node, and dragging pulls out its curve handles,
 * mirrored on both sides. Pressing the first node closes the path; Enter, a
 * double-click or another tool finishes it; Escape drops it. The path is
 * added as one item, in one undo step, once it is finished. As the Polyline,
 * it draws only straight pieces, as SVG's polylines and polygons are.
 */
export class PenTool {
	#nodes: PathNode[] = [];
	#closed = false;
	#cursor: Point | null = null;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
		private readonly style: () => PenStyle,
		private readonly pieces: PenPieces = PenPieces.Curves,
	) {}

	get drawing(): boolean {
		return this.#nodes.length > 0;
	}

	/** A press: closes the path on its first node, picks up its last node again, or adds a node. */
	begin(point: Point, visualScale: number): DrawingGesture {
		const reach = PEN_NODE_REACH * visualScale;
		const first = this.#nodes[0];
		if (first && this.#nodes.length >= MINIMUM_NODES && distance(first.point, point) <= reach) {
			this.#closed = true;
			return this.nodeGesture(0, () => this.finish());
		}
		const last = this.#nodes.at(-1);
		// A second press on the last node, as a double-click makes, shapes that node instead of adding one.
		if (last && distance(last.point, point) <= reach) return this.nodeGesture(this.#nodes.length - 1);
		this.#nodes.push({ point });
		this.preview();
		return this.nodeGesture(this.#nodes.length - 1);
	}

	/** Shows where the next piece would go. */
	hover(point: Point): void {
		if (!this.drawing) return;
		this.#cursor = point;
		this.preview();
	}

	/** Adds the path drawn so far, if it has a piece. */
	finish(): void {
		const nodes = this.#nodes;
		const closed = this.#closed;
		this.reset();
		if (nodes.length < MINIMUM_NODES) return;
		this.objects.add(this.path(crypto.randomUUID(), [{ nodes, closed }]));
	}

	cancel(): void {
		this.reset();
	}

	/** Dragging from a node pulls its handles out, the leaving one under the pointer and the arriving one opposite. */
	private nodeGesture(index: number, onComplete?: () => void): DrawingGesture {
		const anchor = this.#nodes[index]!.point;
		return {
			locksScroll: true,
			update: (point) => {
				if (this.pieces === PenPieces.Straight || distance(anchor, point) < POINTER_DRAG_THRESHOLD) return;
				const node = this.#nodes[index];
				if (!node) return;
				const mirrored = { x: HALF * anchor.x - point.x, y: HALF * anchor.y - point.y };
				// Closing on the first node shapes the curve arriving at it, so the drag sets its arriving handle.
				this.#nodes[index] = index === 0 && this.#closed ? { ...node, in: point, out: mirrored } : { ...node, out: point, in: mirrored };
				this.#cursor = null;
				this.preview();
			},
			complete: () => {
				if (onComplete) onComplete();
				else this.preview();
			},
			cancel: () => this.cancel(),
		};
	}

	private preview(): void {
		this.documentModel.clearOverlay();
		if (!this.drawing) return;
		const contour: PathContour = { nodes: this.#nodes, closed: this.#closed };
		const rubberBand: PathContour[] = this.#cursor && !this.#closed ? [{ nodes: [this.#nodes.at(-1)!, { point: this.#cursor }], closed: false }] : [];
		const context = this.documentModel.overlayContext;
		if (this.#nodes.length >= MINIMUM_NODES) renderAnnotationObject(context, this.documentModel.canvas, this.path(DRAFT_ID, [contour]));
		if (rubberBand.length) renderAnnotationObject(context, this.documentModel.canvas, { ...this.path(DRAFT_ID, rubberBand), head: LineEnd.None, tail: LineEnd.None, fill: false });
		renderPathNodes(context, [contour], { handles: true, selected: { contour: 0, node: this.#nodes.length - 1 } });
	}

	private path(id: string, contours: PathContour[]): PathAnnotation {
		const { stroke, shapeStyle, fillColor, ends } = this.style();
		return {
			id,
			type: AnnotationObjectTypeId.Path,
			contours,
			color: stroke.color,
			opacity: stroke.opacity,
			// Only a closed path can be filled; an open one keeps its line.
			...styledFields(contours.some(({ closed }) => closed) ? shapeStyle : ShapeStyle.Outline, stroke.size, fillColor),
			dash: LineDash.Solid,
			...(ends.head !== LineEnd.None ? { head: ends.head } : {}),
			...(ends.tail !== LineEnd.None ? { tail: ends.tail } : {}),
		};
	}

	private reset(): void {
		this.#nodes = [];
		this.#closed = false;
		this.#cursor = null;
		this.documentModel.clearOverlay();
	}
}

function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}
