import type { Point } from '../../../core/document/appTypes';
import type { CanvasDocument } from '../../../core/document/imageDocument';
import { elbowPath } from '../../../core/geometry/elbowPath';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import { renderAnnotationObject } from '../../annotations/annotationRenderer';
import { AnnotationObjectTypeId, type ConnectorAnnotation, LineDash } from '../../annotations/annotationTypes';
import type { StrokeOptions } from '../drawingHelpers';
import type { DrawingGesture } from './drawingGesture';
import { ARROW_ENDS, LineEnd, type LineEnds } from '../../annotations/lineEnd';

/** Shorter drags are clicks, not arrows. */
const MINIMUM_CONNECTOR_LENGTH = 2;
const DRAFT_ID = 'connector-draft';

/** Drags out an elbow arrow with the chosen ends, previewed as it will be drawn, and adds it as one connector item. */
export class ConnectorDrawingGesture implements DrawingGesture {
	readonly locksScroll = true;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: AnnotationDocument,
		private readonly start: Point,
		private readonly style: () => StrokeOptions,
		private readonly ends: () => LineEnds = () => ARROW_ENDS,
	) {}

	update(point: Point): void {
		this.documentModel.clearOverlay();
		renderAnnotationObject(this.documentModel.overlayContext, this.documentModel.canvas, this.connector(point, DRAFT_ID));
	}

	complete(point: Point): void {
		this.documentModel.clearOverlay();
		if (Math.hypot(point.x - this.start.x, point.y - this.start.y) < MINIMUM_CONNECTOR_LENGTH) return;
		this.objects.add(this.connector(point, crypto.randomUUID()));
	}

	cancel(): void {
		this.documentModel.clearOverlay();
	}

	private connector(end: Point, id: string): ConnectorAnnotation {
		const { color, size, opacity } = this.style();
		const { head, tail } = this.ends();
		return {
			id,
			type: AnnotationObjectTypeId.Connector,
			points: elbowPath(this.start, end),
			color,
			width: size,
			opacity,
			arrow: head !== LineEnd.None,
			dash: LineDash.Solid,
			// A plain arrowhead is what `arrow` already says; other ends are named.
			...(head !== LineEnd.Arrow && head !== LineEnd.None ? { head } : {}),
			...(tail !== LineEnd.None ? { tail } : {}),
		};
	}
}
