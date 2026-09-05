import type { Point } from '../../../core/document/appTypes';
import { genericShape } from '../../../core/geometry/genericShape';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../../annotations/annotationTypes';
import {
	appendObjectErasurePoint,
	createObjectErasurePath,
} from '../../annotations/objectErasures';
import type { StrokeOptions } from '../drawingHelpers';
import { RetainedDrawingGesture } from './drawingGesture';

export class ObjectErasureGesture extends RetainedDrawingGesture {
	readonly locksScroll = true;
	readonly #pathIndex: number;

	constructor(
		objects: AnnotationDocument,
		private readonly objectId: string,
		point: Point,
		pressure: number,
		options: StrokeOptions,
	) {
		super(objects);
		const object = objects.object(objectId)!;
		this.#pathIndex = object.erasures?.length ?? 0;
		objects.beginInteraction(objectId);
		objects.update(
			objectId,
			(target) => {
				const path = createObjectErasurePath(
					genericShape(target).geometry,
					point,
					pressure,
					options,
				);
				if (target.type === AnnotationObjectTypeId.Stroke)
					path.strokePointLimit = target.points.length;
				target.erasures ??= [];
				target.erasures.push(path);
				target.erasureRevision = (target.erasureRevision ?? 0) + 1;
			},
			false,
		);
	}

	update(point: Point, pressure: number): void {
		this.objects.update(
			this.objectId,
			(object) => {
				const path = object.erasures?.[this.#pathIndex];
				if (!path) return;
				appendObjectErasurePoint(
					path,
					genericShape(object).geometry,
					point,
					pressure,
				);
				object.erasureRevision = (object.erasureRevision ?? 0) + 1;
			},
			false,
		);
	}
}
