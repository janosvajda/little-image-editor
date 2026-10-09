import {
	PaintToolId,
	type CropRect,
	type PaintTool,
	type Point,
} from '../../../core/document/appTypes';
import type { CanvasDocument } from '../../../core/document/imageDocument';
import { genericShape } from '../../../core/geometry/genericShape';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
	type StrokePathStyle,
	type StrokePoint,
} from '../../annotations/annotationTypes';
import { createEmptyStroke } from '../../annotations/paintLayerFactory';
import {
	strokePointBounds,
} from '../../annotations/strokeGeometry';
import { pixelAlignedPoint, type StrokeOptions } from '../drawingHelpers';
import { RetainedDrawingGesture } from './drawingGesture';
import { RasterPaintGesture } from '../rasterPaintGesture';

const POINTER_NUDGE = 0.01;

type PaintTarget =
	| { readonly type: typeof AnnotationObjectTypeId.Stroke; readonly id: string }
	| {
			readonly type: typeof AnnotationObjectTypeId.RasterFragment;
			readonly gesture: RasterPaintGesture;
	  };

/**
 * One paint drag: a new stroke item on top of the active layer, or new pixels
 * on a selected pixel item under the pointer.
 */
export class PaintStrokeGesture extends RetainedDrawingGesture {
	readonly coalesced = true;
	readonly locksScroll = true;
	readonly #target: PaintTarget;

	constructor(
		objects: AnnotationDocument,
		private readonly documentModel: CanvasDocument,
		private readonly tool: PaintTool,
		private readonly options: StrokeOptions,
		point: Point,
		pressure: number,
	) {
		super(objects);
		const aligned = this.paintPoint(point);
		const first = strokePoint(aligned, pressure);
		const second = strokePoint(
			{ x: aligned.x + POINTER_NUDGE, y: aligned.y + POINTER_NUDGE },
			pressure,
		);
		const selected = objects.selected;
		if (
			selected?.type === AnnotationObjectTypeId.RasterFragment &&
			genericShape(selected).contains(point) &&
			selected.rect.width > 0 &&
			selected.rect.height > 0
		) {
			const gesture = new RasterPaintGesture(
				selected.id,
				selected,
				tool,
				options,
				first,
			);
			this.#target = { type: AnnotationObjectTypeId.RasterFragment, gesture };
			objects.beginInteraction(selected.id);
			this.update(second, pressure);
			return;
		}
		const stroke = this.createStroke(first, second);
		this.#target = { type: AnnotationObjectTypeId.Stroke, id: stroke.id };
		objects.add(stroke, false);
	}

	update(point: Point, pressure: number): void {
		const drawingPoint = this.paintPoint(point);
		const target = this.#target;
		if (target.type === AnnotationObjectTypeId.RasterFragment) {
			target.gesture.append(drawingPoint, pressure);
			this.objects.update(
				target.gesture.objectId,
				(object) => {
					if (object.type === AnnotationObjectTypeId.RasterFragment)
						target.gesture.apply(object);
				},
				false,
			);
			return;
		}
		this.objects.update(
			target.id,
			(object) => {
				if (object.type !== AnnotationObjectTypeId.Stroke) return;
				const next = strokePoint(drawingPoint, pressure);
				const previous = object.points.at(-1);
				if (
					this.tool === PaintToolId.Pencil &&
					previous?.x === next.x &&
					previous.y === next.y
				)
					return;
				object.points.push(next);
				object.sourceRect = expandedStrokeBounds(
					object.sourceRect ?? object.rect,
					next,
					object.size,
				);
				object.rect = { ...object.sourceRect };
			},
			false,
		);
	}

	private createStroke(
		first: StrokePoint,
		second: StrokePoint,
	): StrokeAnnotation {
		const stroke: StrokeAnnotation = {
			...createEmptyStroke(),
			...this.options,
			tool: this.tool,
			points: [first, second],
			pathStyles: [this.pathStyle(0)],
			rect: strokePointBounds([first, second], this.options.size),
			seed: randomSeed(),
		};
		stroke.sourceRect = { ...stroke.rect };
		return stroke;
	}

	private pathStyle(startIndex: number): StrokePathStyle {
		return { startIndex, tool: this.tool, ...this.options, seed: randomSeed() };
	}

	private paintPoint(point: Point): Point {
		return this.tool === PaintToolId.Pencil
			? pixelAlignedPoint(
					point,
					this.documentModel.width,
					this.documentModel.height,
					this.options.size,
				)
			: point;
	}
}

function strokePoint(point: Point, pressure: number): StrokePoint {
	return { ...point, pressure: pressure || 1 };
}

function expandedStrokeBounds(
	current: CropRect,
	point: Point,
	strokeSize: number,
): CropRect {
	const padding = strokeSize / 2;
	const left = Math.min(current.x, point.x - padding);
	const top = Math.min(current.y, point.y - padding);
	const right = Math.max(current.x + current.width, point.x + padding);
	const bottom = Math.max(current.y + current.height, point.y + padding);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function randomSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
