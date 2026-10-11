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
import { ShapeStyle, styledFields } from '../../annotations/shapeStyle';

const MINIMUM_SHAPE_LENGTH = 2;
export interface ShapeDrawingStyle extends StrokeOptions {
	/** Outline, fill, or both. */
	readonly shapeStyle: ShapeStyle;
	/** What a filled shape is filled with, inside its line in the stroke's colour. */
	readonly fillColor: string;
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
			opacity: style.opacity,
			...styledFields(style.shapeStyle, style.size, style.fillColor),
		});
	}

	cancel(): void {
		this.documentModel.clearOverlay();
	}

	private render(context: CanvasRenderingContext2D, point: Point): void {
		const style = this.style();
		context.save();
		configureStroke(context, style);
		context.fillStyle = style.fillColor;
		drawShape(context, this.tool, this.start, point, style.shapeStyle !== ShapeStyle.Outline, style.shapeStyle === ShapeStyle.OutlineAndFill);
		context.restore();
	}
}
