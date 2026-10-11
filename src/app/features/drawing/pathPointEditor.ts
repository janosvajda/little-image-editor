import type { Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { pointInShapeFrame, withShapeTransform } from '../../core/geometry/shapeTransformHelpers';
import type { PathContour, PathNode } from '../../core/geometry/vectorPath';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { renderPathNodes } from '../annotations/annotationRenderer';
import { AnnotationObjectTypeId, type PathAnnotation } from '../annotations/annotationTypes';
import type { DrawingGesture } from './gestures/drawingGesture';
import { PEN_NODE_REACH } from './penTool';

/** Which node of which contour. */
export interface PathNodeAddress {
	readonly contour: number;
	readonly node: number;
}

const NodePart = { Point: 'point', In: 'in', Out: 'out' } as const;
type NodePart = (typeof NodePart)[keyof typeof NodePart];

const THIRDS = 3;
/** A smooth node's handles reach a third of the way to its neighbours. */
const HANDLE_REACH = 1 / THIRDS;
/** A contour keeps at least this many nodes, a closed one at least three. */
const MINIMUM_OPEN_NODES = 2;
const MINIMUM_CLOSED_NODES = 3;

/**
 * Edits a path's points: its nodes and their curve handles are shown, a
 * node or a handle is dragged, Alt on a node switches it between a corner
 * and a smooth curve, and Delete removes the chosen node. Each change is one
 * undo step. Pressing anywhere else ends the editing.
 */
export class PathPointEditor {
	#pathId: string | null = null;
	#selected: PathNodeAddress | null = null;
	readonly #editingListeners = new Set<(editing: boolean) => void>();

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
	) {
		objects.onChange(() => {
			if (!this.#pathId) return;
			// Editing ends when the path goes away or another item is chosen.
			if (!this.path() || this.objects.selected?.id !== this.#pathId) this.stop();
			else this.render();
		});
	}

	get editing(): boolean {
		return this.#pathId !== null;
	}

	/** Told when editing starts and ends, so the item's resize frame can step aside for its nodes. */
	onEditingChange(listener: (editing: boolean) => void): void {
		this.#editingListeners.add(listener);
	}

	edit(pathId: string): void {
		if (this.objects.object(pathId)?.type !== AnnotationObjectTypeId.Path) return;
		this.#pathId = pathId;
		this.#selected = null;
		this.objects.select(pathId);
		this.render();
		this.#editingListeners.forEach((listener) => listener(true));
	}

	stop(): void {
		if (!this.#pathId) return;
		this.#pathId = null;
		this.#selected = null;
		this.documentModel.clearOverlay();
		this.#editingListeners.forEach((listener) => listener(false));
	}

	/**
	 * A press while editing: on a node or a handle it starts dragging it, and
	 * with Alt on a node it switches the node between a corner and a curve.
	 * Anywhere else it ends the editing and returns null, so the press does
	 * what it would otherwise do.
	 */
	begin(point: Point, visualScale: number, alternate: boolean): DrawingGesture | null {
		const path = this.path();
		if (!path) return null;
		const local = pointInShapeFrame(genericShape(path).geometry, point);
		const hit = this.hit(path, local, PEN_NODE_REACH * visualScale);
		if (!hit) {
			this.stop();
			return null;
		}
		this.#selected = hit.address;
		if (alternate && hit.part === NodePart.Point) {
			this.change((contours) => toggleSmooth(contours, hit.address), true);
			return null;
		}
		this.render();
		return this.dragGesture(path, hit.address, hit.part, local);
	}

	/** Removes the chosen node, or the whole contour's last nodes with the path; whether a node was chosen. */
	removeSelected(): boolean {
		const path = this.path();
		const selected = this.#selected;
		if (!path || !selected) return false;
		const contour = path.contours[selected.contour]!;
		const minimum = contour.closed ? MINIMUM_CLOSED_NODES : MINIMUM_OPEN_NODES;
		this.#selected = null;
		if (contour.nodes.length <= minimum) {
			// Too few nodes would be left to draw anything: the contour goes, and the path with its last one.
			if (path.contours.length === 1) this.objects.removeSelected();
			else this.change((contours) => contours.filter((_, index) => index !== selected.contour), true);
			return true;
		}
		this.change(
			(contours) =>
				contours.map((candidate, index) =>
					index === selected.contour ? { ...candidate, nodes: candidate.nodes.filter((_, node) => node !== selected.node) } : candidate,
				),
			true,
		);
		return true;
	}

	private dragGesture(path: PathAnnotation, address: PathNodeAddress, part: NodePart, start: Point): DrawingGesture {
		const restore = this.objects.createCheckpoint();
		const geometry = genericShape(path).geometry;
		// Every step of the drag moves the contours as they were when it began.
		const startContours = path.contours;
		return {
			locksScroll: true,
			update: (point) => {
				const local = pointInShapeFrame(geometry, point);
				const delta = { x: local.x - start.x, y: local.y - start.y };
				this.change((contours) => moveNodePart(startContours, address, part, delta) ?? contours, false);
			},
			complete: () => this.objects.commitCurrent(),
			cancel: () => restore(),
		};
	}

	private change(update: (contours: PathContour[]) => PathContour[], commit: boolean): void {
		if (!this.#pathId) return;
		this.objects.update(
			this.#pathId,
			(object) => {
				if (object.type === AnnotationObjectTypeId.Path) object.contours = update(object.contours);
			},
			commit,
		);
		this.render();
	}

	private hit(path: PathAnnotation, point: Point, reach: number): { address: PathNodeAddress; part: NodePart } | null {
		const near = (candidate: Point | undefined) => candidate !== undefined && Math.hypot(candidate.x - point.x, candidate.y - point.y) <= reach;
		for (const [contourIndex, contour] of path.contours.entries())
			for (const [nodeIndex, node] of contour.nodes.entries()) {
				const address = { contour: contourIndex, node: nodeIndex };
				if (near(node.point)) return { address, part: NodePart.Point };
				if (near(node.in)) return { address, part: NodePart.In };
				if (near(node.out)) return { address, part: NodePart.Out };
			}
		return null;
	}

	private render(): void {
		const path = this.path();
		this.documentModel.clearOverlay();
		if (!path) return;
		const context = this.documentModel.overlayContext;
		withShapeTransform(context, genericShape(path).geometry, () =>
			renderPathNodes(context, path.contours, { handles: true, selected: this.#selected }),
		);
	}

	private path(): PathAnnotation | null {
		const object = this.objects.object(this.#pathId);
		return object?.type === AnnotationObjectTypeId.Path ? object : null;
	}
}

/** The contours with one node's point or handle moved from where the drag began; a node takes its handles along. */
function moveNodePart(contours: readonly PathContour[], address: PathNodeAddress, part: NodePart, delta: Point): PathContour[] | null {
	const original = contours[address.contour]?.nodes[address.node];
	if (!original) return null;
	const shift = (point: Point | undefined) => (point ? { x: point.x + delta.x, y: point.y + delta.y } : undefined);
	const moved: PathNode =
		part === NodePart.Point
			? withHandles(shift(original.point)!, shift(original.in), shift(original.out))
			: { ...original, [part]: shift(original[part]) };
	return replaceNode(contours, address, moved);
}

/** A smooth node becomes a corner; a corner gets handles along the line between its neighbours. */
function toggleSmooth(contours: readonly PathContour[], address: PathNodeAddress): PathContour[] {
	const contour = contours[address.contour]!;
	const node = contour.nodes[address.node]!;
	if (node.in || node.out) return replaceNode(contours, address, { point: node.point });
	const count = contour.nodes.length;
	const previous = contour.nodes[(address.node - 1 + count) % count]!.point;
	const next = contour.nodes[(address.node + 1) % count]!.point;
	const direction = { x: (next.x - previous.x) * HANDLE_REACH, y: (next.y - previous.y) * HANDLE_REACH };
	const handles = (scale: number) => ({ x: node.point.x + direction.x * scale, y: node.point.y + direction.y * scale });
	const isEnd = !contour.closed && (address.node === 0 || address.node === count - 1);
	return replaceNode(contours, address, isEnd ? { point: node.point } : withHandles(node.point, handles(-1), handles(1)));
}

function withHandles(point: Point, incoming: Point | undefined, outgoing: Point | undefined): PathNode {
	return { point, ...(incoming ? { in: incoming } : {}), ...(outgoing ? { out: outgoing } : {}) };
}

function replaceNode(contours: readonly PathContour[], address: PathNodeAddress, node: PathNode): PathContour[] {
	return contours.map((contour, index) =>
		index === address.contour ? { ...contour, nodes: contour.nodes.map((candidate, nodeIndex) => (nodeIndex === address.node ? node : candidate)) } : contour,
	);
}
