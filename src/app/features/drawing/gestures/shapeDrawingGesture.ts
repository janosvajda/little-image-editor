import type { Point, ShapeTool } from '../../../core/document/appTypes';
import type { CanvasDocument } from '../../../core/document/imageDocument';
import {
	normalizedRect,
	rectOrientation,
} from '../../../core/geometry/geometryHelpers';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../../annotations/annotationTypes';
import {
	configureStroke,
	drawShape,
	type StrokeOptions,
} from '../drawingHelpers';
import type { DrawingGesture } from './drawingGesture';

const MINIMUM_SHAPE_LENGTH = 2;
export interface ShapeDrawingStyle extends StrokeOptions {
	readonly fill: boolean;
}

export class ShapeDrawingGesture implements DrawingGesture {
	readonly locksScroll = true;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument | undefined,
		private readonly tool: ShapeTool,
		private readonly start: Point,
		private readonly style: () => ShapeDrawingStyle,
	) {}

	update(point: Point): void {
		this.documentModel.clearOverlay();
		this.render(this.documentModel.overlayContext, point);
	}

	complete(point: Point): void {
		this.documentModel.clearOverlay();
		if (!this.objects) {
			this.render(this.documentModel.context, point);
			this.documentModel.commit();
			return;
		}
		if (
			Math.hypot(point.x - this.start.x, point.y - this.start.y) <
			MINIMUM_SHAPE_LENGTH
		)
			return;
		const style = this.style();
		this.objects.add({
			id: crypto.randomUUID(),
			type: AnnotationObjectTypeId.Shape,
			shape: this.tool,
			rect: normalizedRect(this.start, point),
			...rectOrientation(this.start, point),
			rotation: 0,
			color: style.color,
			width: style.size,
			opacity: style.opacity,
			fill: style.fill,
		});
	}

	cancel(): void {
		this.documentModel.clearOverlay();
	}

	private render(context: CanvasRenderingContext2D, point: Point): void {
		const style = this.style();
		context.save();
		configureStroke(context, style);
		drawShape(context, this.tool, this.start, point, style.fill);
		context.restore();
	}
}
