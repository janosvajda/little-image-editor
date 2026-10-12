import type { CropRect, Point } from '../../core/document/appTypes';
import { PaintToolId } from '../../core/document/appTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type ConnectorAnnotation,
	connectorEnds,
	LineDash,
	type AnnotationState,
	type AnnotationStateInput,
	type ItemClip,
	type ItemEffects,
	type ObjectErasurePath,
	type ObjectPixelMask,
	type PathAnnotation,
	type RectAnnotation,
	type StrokeAnnotation,
} from './annotationTypes';
import { drawShape } from '../drawing/drawingHelpers';
import {
	RESIZE_HANDLES,
	shapeHandles,
	withShapeTransform,
} from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import { rectEndpoints } from '../../core/geometry/geometryHelpers';
import { ColorPalette } from '../../core/document/colorPalette';
import { textFont } from '../../core/geometry/textShapeMetrics';
import { drawFreehandStroke } from '../drawing/drawingHelpers';
import { strokePathStyleAt, transformedStrokePoints } from './strokeGeometry';
import {
	objectErasureCanvasPoint,
	objectErasureSize,
	objectPixelMaskCanvasPoint,
} from './objectErasures';
import { decodePixelBytes } from '../../shared/image/pixelDataCodec';
import { compositeLayers } from '../layers/layerCompositing';
import { drawLineEnd, fillArrowHead, lineEndInset, pathEnds, trimmedPath } from './arrowHead';
import { withContentLayers } from './contentLayerStructure';
import { EditorLimit } from '../../core/document/editorLimits';
import { FillRule, type PathContour, type PathNode, pathBounds, tracePath } from '../../core/geometry/vectorPath';
import { type Gradient, GradientKind, inFrame } from '../../core/geometry/gradient';
import { LineEnd } from './lineEnd';
import { clipContours } from './itemClip';
import { effectFilter, hasVisibleEffects } from './itemEffects';
import { patternPaint } from './patternPaint';

const AnnotationRendering = {
	/** A connector's dashes and the gaps between them, in line widths. */
	DashPerWidth: 3,
	DashGapPerWidth: 2,
	StepTextScale: 0.55,
	StepTextVerticalOffset: 0.02,
	HalfDivisor: 2,
	FullCircleRadians: Math.PI * 2,
	BlurMinimum: 2,
	BlurSpreadFactor: 2,
	SelectionLineWidth: 1,
	SelectionContrastLineWidth: 3,
	SelectionDash: 5,
	SelectionGap: 4,
	ResizeHandleHalfSize: 4,
	ResizeHandleSize: 8,
	StrokeEndpointHalfSize: 5,
	StrokeEndpointSize: 10,
	ShortHexLength: 3,
	HexRadix: 16,
	RedBitShift: 16,
	GreenBitShift: 8,
	ColorMask: 255,
	RedLumaInteger: 299,
	GreenLumaInteger: 587,
	BlueLumaInteger: 114,
	LumaDivisor: 1_000,
	LightColorThreshold: 145,
	MinimumStrokePointCount: 2,
	RandomMaximum: 4_294_967_296,
	RandomMultiplier: 1_664_525,
	RandomIncrement: 1_013_904_223,
} as const;

/** A handle's dot is half as wide as a node's square. */
const HANDLE_DOT_DIVISOR = 2;
/** A square's side is twice its half. */
const HALF_SIDE = 2;
const erasedObjectCanvas = document.createElement('canvas');
const erasedObjectContext = erasedObjectCanvas.getContext('2d')!;
/** Where an item with effects is drawn before its effects are applied. */
const effectCanvas = document.createElement('canvas');
const effectContext = effectCanvas.getContext('2d')!;
const rasterFragmentCache = new Map<
	string,
	Readonly<{ encodedPixels: string; canvas: HTMLCanvasElement }>
>();

/** Draws every layer's items, then the selected item's frame. */
export function renderAnnotations(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	state: Readonly<AnnotationStateInput>,
	selectedId: string | null = null,
): void {
	const layered = withContentLayers(state);
	renderContentLayers(context, baseCanvas, layered);
	const selected = layered.objects.find((object) => object.id === selectedId);
	if (
		selected &&
		!(
			selected.type === AnnotationObjectTypeId.Stroke &&
			selected.points.length === 0
		)
	)
		renderAnnotationSelection(context, selected);
}

/** Draws every visible layer as one composited group. */
export function renderContentLayers(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	state: Readonly<AnnotationState>,
): void {
	compositeLayers(context, state, (layerContext, item) =>
		renderAnnotationObject(layerContext, baseCanvas, item),
	);
}

export function renderAnnotationObject(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	object: AnnotationObject,
): void {
	if (hasVisibleEffects(object.effects)) {
		renderWithEffects(context, baseCanvas, object, object.effects);
		return;
	}
	if (object.clip) {
		renderClipped(context, baseCanvas, object, object.clip);
		return;
	}
	renderUnaffected(context, baseCanvas, object);
}

/**
 * An item with effects is drawn whole on its own first, then onto the
 * picture through its effects, so a filled and outlined shape, for example,
 * casts one shadow rather than one for each part.
 */
function renderWithEffects(context: CanvasRenderingContext2D, baseCanvas: HTMLCanvasElement, object: AnnotationObject, effects: ItemEffects): void {
	if (effectCanvas.width !== context.canvas.width || effectCanvas.height !== context.canvas.height) {
		effectCanvas.width = context.canvas.width;
		effectCanvas.height = context.canvas.height;
	} else effectContext.clearRect(0, 0, effectCanvas.width, effectCanvas.height);
	renderAnnotationObject(effectContext, baseCanvas, { ...object, effects: undefined });
	context.save();
	context.filter = effectFilter(effects);
	context.drawImage(effectCanvas, 0, 0);
	context.restore();
}

/** An item drawn only inside its clip's outline. */
function renderClipped(context: CanvasRenderingContext2D, baseCanvas: HTMLCanvasElement, object: AnnotationObject, clip: ItemClip): void {
	context.save();
	context.beginPath();
	tracePath(context, clipContours(object, clip));
	context.clip(clip.fillRule ?? FillRule.NonZero);
	renderAnnotationObject(context, baseCanvas, { ...object, clip: undefined });
	context.restore();
}

function renderUnaffected(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	object: AnnotationObject,
): void {
	if (
		!object.erasures?.length &&
		!object.pixelCutouts?.length &&
		!object.pixelClips?.length
	) {
		renderAnnotationObjectContent(context, baseCanvas, object);
		return;
	}
	// Erasing takes away from everything under it, so an item is erased on a canvas of its own, unless the context already keeps it apart.
	const target = isolatesItems(context) ? context : clearedErasedObjectContext(context);
	if (
		object.type === AnnotationObjectTypeId.Stroke &&
		(object.erasures?.length || object.pixelCutouts?.length)
	)
		renderChronologicallyModifiedStroke(target, object);
	else {
		renderAnnotationObjectContent(target, baseCanvas, object);
		applyObjectErasures(target, object);
		applyPixelCutouts(target, object);
	}
	applyPixelClips(target, object);
	if (target !== context) context.drawImage(erasedObjectCanvas, 0, 0);
}

/**
 * A drawing context that keeps each item apart from everything else, as an
 * SVG recording of one item does: erasing in it takes away only from that
 * item, so nothing needs erasing on a canvas of its own first.
 */
export interface ItemIsolatingContext {
	readonly isolatesItems: true;
}

function isolatesItems(context: CanvasRenderingContext2D): boolean {
	return (context as Partial<ItemIsolatingContext>).isolatesItems === true;
}

function clearedErasedObjectContext(context: CanvasRenderingContext2D): CanvasRenderingContext2D {
	resizeErasedObjectCanvas(context.canvas.width, context.canvas.height);
	erasedObjectContext.clearRect(0, 0, erasedObjectCanvas.width, erasedObjectCanvas.height);
	return erasedObjectContext;
}

function applyPixelCutouts(
	context: CanvasRenderingContext2D,
	object: AnnotationObject,
): void {
	const geometry = genericShape(object).geometry;
	context.save();
	withShapeTransform(context, geometry, () => {
		for (const mask of object.pixelCutouts ?? []) {
			context.globalCompositeOperation = 'destination-out';
			fillPixelMask(context, geometry.rect, mask);
		}
	});
	context.restore();
}

function applyPixelClips(
	context: CanvasRenderingContext2D,
	object: AnnotationObject,
): void {
	const geometry = genericShape(object).geometry;
	context.save();
	withShapeTransform(context, geometry, () => {
		for (const mask of object.pixelClips ?? []) {
			context.globalCompositeOperation = 'destination-in';
			fillPixelMask(context, geometry.rect, mask);
		}
	});
	context.restore();
}

function fillPixelMask(
	context: CanvasRenderingContext2D,
	rect: Readonly<{ x: number; y: number; width: number; height: number }>,
	mask: ObjectPixelMask,
): void {
	const first = mask.points[0];
	if (!first) return;
	context.beginPath();
	context.moveTo(
		rect.x + first.xRatio * rect.width,
		rect.y + first.yRatio * rect.height,
	);
	for (const point of mask.points.slice(1))
		context.lineTo(
			rect.x + point.xRatio * rect.width,
			rect.y + point.yRatio * rect.height,
		);
	context.closePath();
	context.fill();
}

function renderAnnotationObjectContent(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	object: AnnotationObject,
): void {
	context.save();
	context.lineCap = 'round';
	context.lineJoin = 'round';
	const geometry = genericShape(object).geometry;
	if (object.type === AnnotationObjectTypeId.Arrow)
		withShapeTransform(context, geometry, () =>
			drawArrow(context, object.from, object.to, object.color, object.width),
		);
	else if (object.type === AnnotationObjectTypeId.Step)
		withShapeTransform(context, geometry, () => drawStep(context, object));
	else if (object.type === AnnotationObjectTypeId.Text)
		withShapeTransform(context, geometry, () => drawText(context, object));
	else if (object.type === AnnotationObjectTypeId.Shape)
		withShapeTransform(context, object, () => {
			if (!object.fill && !hasLine(object)) return;
			context.strokeStyle = paintOf(context, object.lineGradient, object.rect) ?? object.color;
			context.fillStyle = fillPaint(context, object, object.rect);
			context.lineWidth = object.width;
			context.globalAlpha = object.opacity;
			const endpoints = rectEndpoints(object.rect, object);
			drawShape(
				context,
				object.shape,
				endpoints.from,
				endpoints.to,
				object.fill,
				hasOwnFill(object) && hasLine(object),
			);
		});
	else if (object.type === AnnotationObjectTypeId.Stroke)
		withShapeTransform(context, object, () => drawStroke(context, object));
	else if (object.type === AnnotationObjectTypeId.Fill)
		withShapeTransform(context, object, () => {
			context.fillStyle = object.color;
			context.globalAlpha = object.opacity;
			const sourceBounds = fillSourceBounds(object.runs);
			const scaleX = sourceBounds.width
				? object.rect.width / sourceBounds.width
				: 1;
			const scaleY = sourceBounds.height
				? object.rect.height / sourceBounds.height
				: 1;
			for (const run of object.runs)
				context.fillRect(
					object.rect.x + (run.x - sourceBounds.x) * scaleX,
					object.rect.y + (run.y - sourceBounds.y) * scaleY,
					run.length * scaleX,
					scaleY,
				);
		});
	else if (object.type === AnnotationObjectTypeId.RasterFragment)
		withShapeTransform(context, object, () => {
			const fragment = rasterFragmentCanvas(object);
			context.drawImage(
				fragment,
				object.rect.x,
				object.rect.y,
				object.rect.width,
				object.rect.height,
			);
		});
	else if (object.type === AnnotationObjectTypeId.Blur)
		withShapeTransform(context, object, () =>
			drawBlur(context, baseCanvas, object),
		);
	else if (object.type === AnnotationObjectTypeId.Redact)
		withShapeTransform(context, object, () => {
			context.fillStyle = object.color;
			context.fillRect(
				object.rect.x,
				object.rect.y,
				object.rect.width,
				object.rect.height,
			);
		});
	else if (object.type === AnnotationObjectTypeId.Connector)
		withShapeTransform(context, geometry, () => drawConnector(context, object));
	else if (object.type === AnnotationObjectTypeId.Path)
		withShapeTransform(context, geometry, () => drawPath(context, object));
	else if (object.type === AnnotationObjectTypeId.Highlight)
		withShapeTransform(context, object, () => {
			context.globalAlpha = object.opacity;
			context.fillStyle = object.color;
			context.fillRect(
				object.rect.x,
				object.rect.y,
				object.rect.width,
				object.rect.height,
			);
		});
	else {
		withShapeTransform(context, object, () => {
			context.strokeStyle = object.color;
			context.lineWidth = object.width;
			context.strokeRect(
				object.rect.x,
				object.rect.y,
				object.rect.width,
				object.rect.height,
			);
		});
	}
	context.restore();
}

function rasterFragmentCanvas(
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.RasterFragment }
	>,
): HTMLCanvasElement {
	const cached = rasterFragmentCache.get(object.id);
	if (cached?.encodedPixels === object.pixels) {
		// Re-inserting marks the entry as most recently used.
		rasterFragmentCache.delete(object.id);
		rasterFragmentCache.set(object.id, cached);
		return cached.canvas;
	}
	const pixels = decodePixelBytes(object.pixels);
	const canvas = document.createElement('canvas');
	canvas.width = object.pixelWidth;
	canvas.height = object.pixelHeight;
	canvas
		.getContext('2d')!
		.putImageData(
			new ImageData(
				new Uint8ClampedArray(pixels),
				object.pixelWidth,
				object.pixelHeight,
			),
			0,
			0,
		);
	rasterFragmentCache.delete(object.id);
	rasterFragmentCache.set(object.id, { encodedPixels: object.pixels, canvas });
	const leastRecentlyUsed = rasterFragmentCache.keys().next();
	if (
		rasterFragmentCache.size > EditorLimit.RasterLayerRenderCache &&
		!leastRecentlyUsed.done
	)
		rasterFragmentCache.delete(leastRecentlyUsed.value);
	return canvas;
}

function applyObjectErasures(
	context: CanvasRenderingContext2D,
	object: AnnotationObject,
): void {
	const geometry = genericShape(object).geometry;
	withShapeTransform(context, geometry, () => {
		for (const path of object.erasures ?? [])
			applyObjectErasure(context, geometry, path);
	});
}

function applyObjectErasure(
	context: CanvasRenderingContext2D,
	geometry: ReturnType<typeof genericShape>['geometry'],
	path: ObjectErasurePath,
	firstSegmentIndex = 1,
): void {
	const options = {
		color: ColorPalette.Black,
		size: objectErasureSize(geometry, path),
		opacity: path.opacity,
		hardness: path.hardness,
	};
	for (
		let index = Math.max(1, firstSegmentIndex);
		index < path.points.length;
		index += 1
	) {
		const fromPoint = path.points[index - 1]!;
		const toPoint = path.points[index]!;
		drawFreehandStroke(
			context,
			PaintToolId.Eraser,
			objectErasureCanvasPoint(geometry, fromPoint),
			objectErasureCanvasPoint(geometry, toPoint),
			options,
			toPoint.pressure,
		);
	}
}

export function renderObjectErasureTail(
	context: CanvasRenderingContext2D,
	object: AnnotationObject,
	path: ObjectErasurePath,
	previousPointCount: number,
): void {
	const geometry = genericShape(object).geometry;
	withShapeTransform(context, geometry, () =>
		applyObjectErasure(context, geometry, path, previousPointCount),
	);
}

function renderChronologicallyModifiedStroke(
	context: CanvasRenderingContext2D,
	object: StrokeAnnotation,
): void {
	context.save();
	context.lineCap = 'round';
	context.lineJoin = 'round';
	const geometry = genericShape(object).geometry;
	const pathStarts = new Set(object.pathStarts);
	withShapeTransform(context, geometry, () => {
		let firstSegmentIndex = 1;
		const events = [
			...(object.erasures ?? []).map((erasure, order) => ({
				kind: 'erasure' as const,
				pointLimit: erasure.strokePointLimit ?? object.points.length,
				order,
				erasure,
			})),
			...(object.pixelCutouts ?? []).map((mask, order) => ({
				kind: 'cutout' as const,
				pointLimit: mask.strokePointLimit ?? object.points.length,
				order,
				mask,
			})),
		].sort(
			(left, right) =>
				left.pointLimit - right.pointLimit || left.order - right.order,
		);
		for (const event of events) {
			const pointLimit = Math.min(
				object.points.length,
				Math.max(AnnotationRendering.MinimumStrokePointCount, event.pointLimit),
			);
			drawStrokeRange(
				context,
				object,
				firstSegmentIndex,
				pointLimit,
				pathStarts,
			);
			if (event.kind === 'erasure')
				applyObjectErasure(context, geometry, event.erasure);
			else {
				context.globalCompositeOperation = 'destination-out';
				fillStrokePixelMask(context, object, event.mask);
				context.globalCompositeOperation = 'source-over';
			}
			firstSegmentIndex = pointLimit;
		}
		drawStrokeRange(
			context,
			object,
			firstSegmentIndex,
			object.points.length,
			pathStarts,
		);
	});
	context.restore();
}

function fillStrokePixelMask(
	context: CanvasRenderingContext2D,
	stroke: StrokeAnnotation,
	mask: ObjectPixelMask,
): void {
	const reference = mask.strokeSourceRect;
	if (!reference) {
		fillPixelMask(context, stroke.rect, mask);
		return;
	}
	const first = mask.points[0];
	if (!first) return;
	const start = objectPixelMaskCanvasPoint(stroke, mask, first);
	context.beginPath();
	context.moveTo(start.x, start.y);
	for (const point of mask.points.slice(1)) {
		const next = objectPixelMaskCanvasPoint(stroke, mask, point);
		context.lineTo(next.x, next.y);
	}
	context.closePath();
	context.fill();
}

function resizeErasedObjectCanvas(width: number, height: number): void {
	if (
		erasedObjectCanvas.width === width &&
		erasedObjectCanvas.height === height
	)
		return;
	erasedObjectCanvas.width = width;
	erasedObjectCanvas.height = height;
}

function fillSourceBounds(
	runs: ReadonlyArray<Readonly<{ x: number; y: number; length: number }>>,
): { x: number; y: number; width: number; height: number } {
	const left = Math.min(...runs.map((run) => run.x));
	const top = Math.min(...runs.map((run) => run.y));
	const right = Math.max(...runs.map((run) => run.x + run.length));
	const bottom = Math.max(...runs.map((run) => run.y + 1));
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function drawStroke(
	context: CanvasRenderingContext2D,
	object: StrokeAnnotation,
): void {
	if (object.points.length < AnnotationRendering.MinimumStrokePointCount)
		return;
	drawStrokeRange(
		context,
		object,
		1,
		object.points.length,
		new Set(object.pathStarts),
	);
}

function drawStrokeRange(
	context: CanvasRenderingContext2D,
	object: StrokeAnnotation,
	firstSegmentIndex: number,
	endPointIndex: number,
	pathStarts: ReadonlySet<number>,
): void {
	const source = object.sourceRect ?? object.rect;
	const scaleX = source.width === 0 ? 1 : object.rect.width / source.width;
	const scaleY = source.height === 0 ? 1 : object.rect.height / source.height;
	const from = { x: 0, y: 0 };
	const to = { x: 0, y: 0 };
	for (
		let index = Math.max(1, firstSegmentIndex);
		index < endPointIndex;
		index += 1
	) {
		if (pathStarts.has(index)) continue;
		const sourceFrom = object.points[index - 1]!;
		const sourceTo = object.points[index]!;
		const style = strokePathStyleAt(object, index);
		from.x = object.rect.x + (sourceFrom.x - source.x) * scaleX;
		from.y = object.rect.y + (sourceFrom.y - source.y) * scaleY;
		to.x = object.rect.x + (sourceTo.x - source.x) * scaleX;
		to.y = object.rect.y + (sourceTo.y - source.y) * scaleY;
		drawFreehandStroke(
			context,
			style.tool,
			from,
			to,
			{
				color: style.color,
				size: style.size,
				opacity: style.opacity,
				hardness: style.hardness,
			},
			sourceTo.pressure,
			seededRandom(style.seed + index),
		);
	}
}

export function renderStrokeTail(
	context: CanvasRenderingContext2D,
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Stroke }
	>,
	previousPointCount: number,
): void {
	if (object.points.length <= previousPointCount) return;
	const sourceObject: StrokeAnnotation = {
		...object,
		rotation: 0,
		rect: { ...(object.sourceRect ?? object.rect) },
	};
	context.save();
	context.lineCap = 'round';
	context.lineJoin = 'round';
	withShapeTransform(context, sourceObject, () =>
		drawStrokeRange(
			context,
			sourceObject,
			previousPointCount,
			sourceObject.points.length,
			new Set(sourceObject.pathStarts),
		),
	);
	context.restore();
}

export function supportsIncrementalStrokeRendering(
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Stroke }
	>,
): boolean {
	return (
		strokePathStyleAt(object, object.points.length - 1).tool !==
		PaintToolId.Spray
	);
}

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state =
			(state * AnnotationRendering.RandomMultiplier +
				AnnotationRendering.RandomIncrement) >>>
			0;
		return state / AnnotationRendering.RandomMaximum;
	};
}

function drawArrow(
	context: CanvasRenderingContext2D,
	from: Point,
	to: Point,
	color: string,
	width: number,
): void {
	context.strokeStyle = color;
	context.fillStyle = color;
	context.lineWidth = width;
	context.beginPath();
	context.moveTo(from.x, from.y);
	context.lineTo(to.x, to.y);
	context.stroke();
	fillArrowHead(context, from, to, width);
}

/** A connector's path, dashed when asked, with its ends on its first and last pieces. */
function drawConnector(context: CanvasRenderingContext2D, object: ConnectorAnnotation): void {
	if (!object.points.length) return;
	context.strokeStyle = object.color;
	context.fillStyle = object.color;
	context.lineWidth = object.width;
	context.globalAlpha = object.opacity;
	context.setLineDash(
		object.dash === LineDash.Dashed
			? [object.width * AnnotationRendering.DashPerWidth, object.width * AnnotationRendering.DashGapPerWidth]
			: [],
	);
	const { head, tail } = connectorEnds(object);
	const path = trimmedPath(object.points, lineEndInset(object.width, tail), lineEndInset(object.width, head));
	context.beginPath();
	context.moveTo(path[0]!.x, path[0]!.y);
	for (const point of path.slice(1)) context.lineTo(point.x, point.y);
	context.stroke();
	context.setLineDash([]);
	const [start, second] = object.points;
	const tip = object.points.at(-1)!;
	const before = object.points.at(-2)!;
	drawLineEnd(context, before, tip, object.width, head);
	if (second) drawLineEnd(context, second, start!, object.width, tail);
}

/** A vector path: its closed contours filled by its fill rule, then its line, dashed when asked, with its ends. */
function drawPath(context: CanvasRenderingContext2D, object: PathAnnotation): void {
	// Traced into the context itself, so anything that records its calls, such as SVG export, sees the path.
	context.beginPath();
	tracePath(context, object.contours);
	context.globalAlpha = object.opacity;
	const frame = pathBounds(object.contours);
	if (object.fill && object.contours.some(({ closed }) => closed)) {
		context.fillStyle = fillPaint(context, object, frame);
		context.fill(object.fillRule ?? FillRule.NonZero);
		// A path filled before fill colours is only its fill, as a filled shape is.
		if (!hasOwnFill(object)) return;
	}
	if (!hasLine(object)) return;
	context.strokeStyle = paintOf(context, object.lineGradient, frame) ?? object.color;
	context.fillStyle = object.color;
	context.lineWidth = object.width;
	context.setLineDash(
		object.dash === LineDash.Dashed
			? [object.width * AnnotationRendering.DashPerWidth, object.width * AnnotationRendering.DashGapPerWidth]
			: [],
	);
	context.stroke();
	context.setLineDash([]);
	const ends = pathEnds(object.contours);
	if (!ends) return;
	drawLineEnd(context, ends.headFrom, ends.head, object.width, object.head ?? LineEnd.None);
	drawLineEnd(context, ends.tailFrom, ends.tail, object.width, object.tail ?? LineEnd.None);
}

/** A gradient laid over an item's frame, ready to paint with; none when the item has no gradient there. */
function paintOf(context: CanvasRenderingContext2D, gradient: Gradient | undefined, frame: CropRect): CanvasGradient | undefined {
	if (!gradient) return undefined;
	const start = inFrame(frame, gradient.start);
	const end = inFrame(frame, gradient.end);
	const paint =
		gradient.kind === GradientKind.Linear
			? context.createLinearGradient(start.x, start.y, end.x, end.y)
			: context.createRadialGradient(start.x, start.y, 0, start.x, start.y, Math.hypot(end.x - start.x, end.y - start.y));
	for (const { offset, color } of gradient.stops) paint.addColorStop(offset, color);
	return paint;
}

/** Whether an item has a line to draw: a width of none means only its fill shows, as an SVG shape without a stroke. */
function hasLine(object: Pick<PathAnnotation, 'width'>): boolean {
	return object.width > 0;
}

/** Whether a filled item has a fill of its own under its line, a colour or a gradient, rather than being all one colour. */
function hasOwnFill(object: Pick<PathAnnotation, 'fillColor' | 'fillGradient' | 'fillPattern'>): boolean {
	return object.fillColor !== undefined || object.fillGradient !== undefined || object.fillPattern !== undefined;
}

/** What a filled item's inside is painted with: its pattern, its gradient, its own fill colour, or its colour. */
function fillPaint(context: CanvasRenderingContext2D, object: Pick<PathAnnotation, 'color' | 'fillColor' | 'fillGradient' | 'fillPattern'>, frame: CropRect): string | CanvasGradient | CanvasPattern {
	const pattern = object.fillPattern ? patternPaint(context, object.fillPattern, frame) : null;
	return pattern ?? paintOf(context, object.fillGradient, frame) ?? object.fillColor ?? object.color;
}

function drawStep(
	context: CanvasRenderingContext2D,
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Step }
	>,
): void {
	const radius = object.size / AnnotationRendering.HalfDivisor;
	context.fillStyle = object.color;
	context.beginPath();
	context.arc(
		object.at.x,
		object.at.y,
		radius,
		0,
		AnnotationRendering.FullCircleRadians,
	);
	context.fill();
	context.fillStyle = contrastColor(object.color);
	context.font = `700 ${Math.round(object.size * AnnotationRendering.StepTextScale)}px system-ui,sans-serif`;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(
		String(object.value),
		object.at.x,
		object.at.y + object.size * AnnotationRendering.StepTextVerticalOffset,
	);
}

function drawText(
	context: CanvasRenderingContext2D,
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Text }
	>,
): void {
	const frame = genericShape(object).geometry.rect;
	context.fillStyle = object.color;
	context.font = textFont(object.size);
	context.textBaseline = 'alphabetic';
	if (object.rect)
		context.fillText(object.text, frame.x, frame.y + object.size, frame.width);
	else context.fillText(object.text, frame.x, frame.y + object.size);
}

function drawBlur(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	object: RectAnnotation,
): void {
	context.save();
	context.beginPath();
	context.rect(
		object.rect.x,
		object.rect.y,
		object.rect.width,
		object.rect.height,
	);
	context.clip();
	context.filter = `blur(${Math.max(AnnotationRendering.BlurMinimum, object.blur)}px)`;
	const spread = object.blur * AnnotationRendering.BlurSpreadFactor;
	context.drawImage(
		baseCanvas,
		object.rect.x - spread,
		object.rect.y - spread,
		object.rect.width + spread * AnnotationRendering.BlurSpreadFactor,
		object.rect.height + spread * AnnotationRendering.BlurSpreadFactor,
		object.rect.x - spread,
		object.rect.y - spread,
		object.rect.width + spread * AnnotationRendering.BlurSpreadFactor,
		object.rect.height + spread * AnnotationRendering.BlurSpreadFactor,
	);
	context.restore();
}

/** Nodes drawn while a path is drawn or edited: squares on its points, dots on its handles, lines to them. */
export interface PathNodeMarks {
	/** The node drawn as chosen, which a key acts on. */
	readonly selected?: Readonly<{ contour: number; node: number }> | null;
	/** Whether handles are shown, as they are while points are edited. */
	readonly handles: boolean;
}

export function renderPathNodes(context: CanvasRenderingContext2D, contours: readonly PathContour[], marks: PathNodeMarks): void {
	const visualScale = canvasVisualScale(context.canvas);
	const half = AnnotationRendering.ResizeHandleHalfSize * visualScale;
	context.save();
	context.setLineDash([]);
	context.lineWidth = AnnotationRendering.SelectionLineWidth * visualScale;
	context.strokeStyle = ColorPalette.RoyalBlue;
	contours.forEach((contour, contourIndex) =>
		contour.nodes.forEach((node, nodeIndex) => {
			if (marks.handles) drawNodeHandles(context, node, half);
			const chosen = marks.selected?.contour === contourIndex && marks.selected.node === nodeIndex;
			context.fillStyle = chosen ? ColorPalette.RoyalBlue : ColorPalette.White;
			context.fillRect(node.point.x - half, node.point.y - half, half * HALF_SIDE, half * HALF_SIDE);
			context.strokeRect(node.point.x - half, node.point.y - half, half * HALF_SIDE, half * HALF_SIDE);
		}),
	);
	context.restore();
}

/** A gradient's two points, in the selection style: a line between them, a ring at the start and a square at the end. */
export function renderGradientHandles(context: CanvasRenderingContext2D, start: Point, end: Point): void {
	const visualScale = canvasVisualScale(context.canvas);
	const half = AnnotationRendering.ResizeHandleHalfSize * visualScale;
	context.save();
	context.setLineDash([]);
	context.lineWidth = AnnotationRendering.SelectionLineWidth * visualScale;
	context.strokeStyle = ColorPalette.RoyalBlue;
	context.fillStyle = ColorPalette.White;
	context.beginPath();
	context.moveTo(start.x, start.y);
	context.lineTo(end.x, end.y);
	context.stroke();
	context.beginPath();
	context.arc(start.x, start.y, half, 0, AnnotationRendering.FullCircleRadians);
	context.fill();
	context.stroke();
	context.fillRect(end.x - half, end.y - half, half * HALF_SIDE, half * HALF_SIDE);
	context.strokeRect(end.x - half, end.y - half, half * HALF_SIDE, half * HALF_SIDE);
	context.restore();
}

/** A node's handles: a line from the node to each, and a dot on it. */
function drawNodeHandles(context: CanvasRenderingContext2D, node: PathNode, half: number): void {
	for (const handle of [node.in, node.out]) {
		if (!handle) continue;
		context.beginPath();
		context.moveTo(node.point.x, node.point.y);
		context.lineTo(handle.x, handle.y);
		context.stroke();
		context.fillStyle = ColorPalette.RoyalBlue;
		context.beginPath();
		context.arc(handle.x, handle.y, half / HANDLE_DOT_DIVISOR, 0, AnnotationRendering.FullCircleRadians);
		context.fill();
	}
}

export function renderAnnotationSelection(
	context: CanvasRenderingContext2D,
	object: AnnotationObject,
): void {
	const bounds = genericShape(object).geometry.rect;
	const visualScale = canvasVisualScale(context.canvas);
	context.save();
	const geometry = genericShape(object).geometry;
	withShapeTransform(context, geometry, () => {
		context.strokeStyle = ColorPalette.White;
		context.lineWidth =
			AnnotationRendering.SelectionContrastLineWidth * visualScale;
		context.setLineDash([]);
		strokeRectangle(context, bounds.x, bounds.y, bounds.width, bounds.height);
		context.strokeStyle = ColorPalette.RoyalBlue;
		context.lineWidth = AnnotationRendering.SelectionLineWidth * visualScale;
		context.setLineDash([
			AnnotationRendering.SelectionDash * visualScale,
			AnnotationRendering.SelectionGap * visualScale,
		]);
		strokeRectangle(context, bounds.x, bounds.y, bounds.width, bounds.height);
	});
	context.setLineDash([]);
	context.fillStyle = ColorPalette.White;
	context.strokeStyle = ColorPalette.RoyalBlue;
	const handles = shapeHandles(genericShape(object).geometry);
	const halfSize = AnnotationRendering.ResizeHandleHalfSize * visualScale;
	const size = AnnotationRendering.ResizeHandleSize * visualScale;
	for (const handle of RESIZE_HANDLES) {
		const point = handles[handle];
		context.fillRect(point.x - halfSize, point.y - halfSize, size, size);
		strokeRectangle(
			context,
			point.x - halfSize,
			point.y - halfSize,
			size,
			size,
		);
	}
	if (object.type === AnnotationObjectTypeId.Stroke)
		renderStrokeEndpointHandles(context, object, visualScale);
	context.restore();
}

function renderStrokeEndpointHandles(
	context: CanvasRenderingContext2D,
	stroke: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Stroke }
	>,
	visualScale: number,
): void {
	const points = transformedStrokePoints(stroke);
	const halfSize = AnnotationRendering.StrokeEndpointHalfSize * visualScale;
	const size = AnnotationRendering.StrokeEndpointSize * visualScale;
	for (const point of [points[0], points.at(-1)]) {
		if (!point) continue;
		context.fillRect(point.x - halfSize, point.y - halfSize, size, size);
		strokeRectangle(
			context,
			point.x - halfSize,
			point.y - halfSize,
			size,
			size,
		);
	}
}

function canvasVisualScale(canvas: HTMLCanvasElement | undefined): number {
	if (!canvas) return 1;
	const renderedWidth = canvas.getBoundingClientRect().width;
	return renderedWidth > 0 ? canvas.width / renderedWidth : 1;
}

function strokeRectangle(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
): void {
	context.beginPath();
	context.rect(x, y, width, height);
	context.stroke();
}

function contrastColor(color: string): string {
	const normalized = color.replace('#', '');
	const value = Number.parseInt(
		normalized.length === AnnotationRendering.ShortHexLength
			? normalized
					.split('')
					.map((character) => character + character)
					.join('')
			: normalized,
		AnnotationRendering.HexRadix,
	);
	const brightness =
		((value >> AnnotationRendering.RedBitShift) *
			AnnotationRendering.RedLumaInteger +
			((value >> AnnotationRendering.GreenBitShift) &
				AnnotationRendering.ColorMask) *
				AnnotationRendering.GreenLumaInteger +
			(value & AnnotationRendering.ColorMask) *
				AnnotationRendering.BlueLumaInteger) /
		AnnotationRendering.LumaDivisor;
	return brightness > AnnotationRendering.LightColorThreshold
		? ColorPalette.NearBlack
		: ColorPalette.White;
}
