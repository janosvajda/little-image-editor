import type { Point } from '../../../core/document/appTypes';
import { genericShape } from '../../../core/geometry/genericShape';
import { enclosingBounds } from '../../../core/geometry/shapeTransformHelpers';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../../annotations/annotationTypes';
import {
	appendObjectErasurePoint,
	createObjectErasurePath,
} from '../../annotations/objectErasures';
import type { StrokeOptions } from '../drawingHelpers';
import { RetainedDrawingGesture } from './drawingGesture';

const HALF = 2;

interface EraserSample {
	readonly point: Point;
	readonly pressure: number;
}

/**
 * Erases from a set of items, usually every item of the active layer. An item
 * gets its own erasure path only once the eraser reaches it, starting from the
 * previous sample, so untouched items keep no erasure data.
 */
export class ObjectErasureGesture extends RetainedDrawingGesture {
	readonly locksScroll = true;
	readonly #pathIndices = new Map<string, number>();
	#previous: EraserSample;

	constructor(
		objects: AnnotationDocument,
		private readonly itemIds: readonly string[],
		point: Point,
		pressure: number,
		private readonly options: StrokeOptions,
	) {
		super(objects);
		this.#previous = { point, pressure };
		this.erase({ point, pressure });
	}

	update(point: Point, pressure: number): void {
		this.erase({ point, pressure });
	}

	override complete(point: Point): void {
		if (this.#pathIndices.size === 0) this.cancel();
		else super.complete(point);
	}

	private erase(sample: EraserSample): void {
		for (const id of this.itemIds) {
			const item = this.objects.object(id);
			if (!item) continue;
			const pathIndex = this.#pathIndices.get(id);
			if (pathIndex !== undefined) this.extendPath(id, pathIndex, sample);
			else if (this.reaches(item, sample.point)) this.startPath(id, sample);
		}
		this.#previous = sample;
	}

	private startPath(id: string, sample: EraserSample): void {
		const start = this.#previous;
		this.objects.beginInteraction(id);
		this.objects.update(
			id,
			(target) => {
				const geometry = genericShape(target).geometry;
				const path = createObjectErasurePath(
					geometry,
					start.point,
					start.pressure,
					this.options,
				);
				if (sample.point.x !== start.point.x || sample.point.y !== start.point.y)
					appendObjectErasurePoint(path, geometry, sample.point, sample.pressure);
				if (target.type === AnnotationObjectTypeId.Stroke)
					path.strokePointLimit = target.points.length;
				target.erasures ??= [];
				this.#pathIndices.set(id, target.erasures.length);
				target.erasures.push(path);
				target.erasureRevision = (target.erasureRevision ?? 0) + 1;
			},
			false,
		);
	}

	private extendPath(id: string, pathIndex: number, sample: EraserSample): void {
		this.objects.update(
			id,
			(target) => {
				const path = target.erasures?.[pathIndex];
				if (!path) return;
				appendObjectErasurePoint(
					path,
					genericShape(target).geometry,
					sample.point,
					sample.pressure,
				);
				target.erasureRevision = (target.erasureRevision ?? 0) + 1;
			},
			false,
		);
	}

	/** Whether the eraser's footprint between the last sample and `point` can touch the item. */
	private reaches(item: AnnotationObject, point: Point): boolean {
		const bounds = enclosingBounds([genericShape(item).geometry]);
		if (!bounds) return false;
		const reach = this.options.size / HALF;
		const from = this.#previous.point;
		return (
			Math.max(point.x, from.x) >= bounds.x - reach &&
			Math.min(point.x, from.x) <= bounds.x + bounds.width + reach &&
			Math.max(point.y, from.y) >= bounds.y - reach &&
			Math.min(point.y, from.y) <= bounds.y + bounds.height + reach
		);
	}
}
