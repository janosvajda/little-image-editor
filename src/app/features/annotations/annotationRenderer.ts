import type { Point } from '../../core/document/appTypes';
import { PaintToolId } from '../../core/document/appTypes';
import { annotationBounds } from './annotationDocument';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type AnnotationState,
	type RectAnnotation,
} from './annotationTypes';
import { drawShape } from '../drawing/drawingHelpers';
import {
	ShapeHandleId,
	ShapeHandleMetrics,
	shapeHandles,
	withShapeTransform,
} from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import { ColorPalette } from '../../core/document/colorPalette';
import { textFont } from '../../core/geometry/textShapeMetrics';
import { drawFreehandStroke } from '../drawing/drawingHelpers';
import { transformedStrokePoints } from './strokeGeometry';

const AnnotationRendering = {
	ArrowMinimumHead: 10,
	ArrowHeadWidthFactor: 4,
	ArrowAngleDivisor: 6,
	StepTextScale: 0.55,
	StepTextVerticalOffset: 0.02,
	HalfDivisor: 2,
	FullCircleRadians: Math.PI * 2,
	BlurMinimum: 2,
	BlurSpreadFactor: 2,
	SelectionLineWidth: 1,
	SelectionDash: 5,
	SelectionGap: 4,
	RotateHandleHalfSize: 5,
	RotateHandleSize: 10,
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

export function renderAnnotations(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	state: Readonly<AnnotationState>,
	selectedId: string | null = null,
): void {
	renderAnnotationObjects(context, baseCanvas, state.objects);
	const selected = state.objects.find((object) => object.id === selectedId);
	if (selected) renderAnnotationSelection(context, selected);
}

export function renderAnnotationObjects(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	objects: readonly AnnotationObject[],
): void {
	objects.filter((object) => object.visible !== false).forEach((object) =>
		renderAnnotationObject(context, baseCanvas, object),
	);
}

export function renderAnnotationObject(
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
			context.strokeStyle = object.color;
			context.fillStyle = object.color;
			context.lineWidth = object.width;
			context.globalAlpha = object.opacity;
			drawShape(
				context,
				object.shape,
				{ x: object.rect.x, y: object.rect.y },
				{
					x: object.rect.x + object.rect.width,
					y: object.rect.y + object.rect.height,
				},
				object.fill,
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
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Stroke }
	>,
): void {
	if (object.points.length < AnnotationRendering.MinimumStrokePointCount) return;
	const source = object.sourceRect ?? object.rect;
	const scaleX = source.width === 0 ? 1 : object.rect.width / source.width;
	const scaleY = source.height === 0 ? 1 : object.rect.height / source.height;
	const random = seededRandom(object.seed);
	const from = { x: 0, y: 0 };
	const to = { x: 0, y: 0 };
	for (let index = 1; index < object.points.length; index += 1) {
		const sourceFrom = object.points[index - 1]!;
		const sourceTo = object.points[index]!;
		from.x = object.rect.x + (sourceFrom.x - source.x) * scaleX;
		from.y = object.rect.y + (sourceFrom.y - source.y) * scaleY;
		to.x = object.rect.x + (sourceTo.x - source.x) * scaleX;
		to.y = object.rect.y + (sourceTo.y - source.y) * scaleY;
		drawFreehandStroke(
			context,
			object.tool,
			from,
			to,
			{
				color: object.color,
				size: object.size,
				opacity: object.opacity,
				hardness: object.hardness,
			},
			sourceTo.pressure,
			random,
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
	const firstRequiredPoint = Math.max(0, previousPointCount - 1);
	const points = object.points.slice(firstRequiredPoint);
	if (points.length < AnnotationRendering.MinimumStrokePointCount) return;
	renderAnnotationObject(context, context.canvas, {
		...object,
		points,
		rotation: 0,
		rect: { ...(object.sourceRect ?? object.rect) },
	});
}

export function supportsIncrementalStrokeRendering(
	object: Extract<
		AnnotationObject,
		{ type: typeof AnnotationObjectTypeId.Stroke }
	>,
): boolean {
	return object.tool !== PaintToolId.Spray;
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
	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	const head = Math.max(
		AnnotationRendering.ArrowMinimumHead,
		width * AnnotationRendering.ArrowHeadWidthFactor,
	);
	context.strokeStyle = color;
	context.fillStyle = color;
	context.lineWidth = width;
	context.beginPath();
	context.moveTo(from.x, from.y);
	context.lineTo(to.x, to.y);
	context.stroke();
	context.beginPath();
	context.moveTo(to.x, to.y);
	const headAngle = Math.PI / AnnotationRendering.ArrowAngleDivisor;
	context.lineTo(
		to.x - head * Math.cos(angle - headAngle),
		to.y - head * Math.sin(angle - headAngle),
	);
	context.lineTo(
		to.x - head * Math.cos(angle + headAngle),
		to.y - head * Math.sin(angle + headAngle),
	);
	context.closePath();
	context.fill();
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

export function renderAnnotationSelection(
	context: CanvasRenderingContext2D,
	object: AnnotationObject,
): void {
	const bounds = annotationBounds(object);
	const visualScale = canvasVisualScale(context.canvas);
	context.save();
	context.strokeStyle = ColorPalette.Selection;
	context.lineWidth = AnnotationRendering.SelectionLineWidth * visualScale;
	context.setLineDash([
		AnnotationRendering.SelectionDash * visualScale,
		AnnotationRendering.SelectionGap * visualScale,
	]);
	const geometry = genericShape(object).geometry;
	withShapeTransform(context, geometry, () =>
		strokeRectangle(context, bounds.x, bounds.y, bounds.width, bounds.height),
	);
	context.setLineDash([]);
	context.fillStyle = ColorPalette.White;
	context.strokeStyle = ColorPalette.Selection;
	const handles = shapeHandles(
		genericShape(object).geometry,
		ShapeHandleMetrics.Offset * visualScale,
	);
	for (const [key, point] of Object.entries(handles)) {
		if (key === ShapeHandleId.Rotate) {
			const halfSize = AnnotationRendering.RotateHandleHalfSize * visualScale;
			const size = AnnotationRendering.RotateHandleSize * visualScale;
			context.fillRect(
				point.x - halfSize,
				point.y - halfSize,
				size,
				size,
			);
			strokeRectangle(
				context,
				point.x - halfSize,
				point.y - halfSize,
				size,
				size,
			);
		} else {
			const halfSize = AnnotationRendering.ResizeHandleHalfSize * visualScale;
			const size = AnnotationRendering.ResizeHandleSize * visualScale;
			context.fillRect(
				point.x - halfSize,
				point.y - halfSize,
				size,
				size,
			);
			strokeRectangle(
				context,
				point.x - halfSize,
				point.y - halfSize,
				size,
				size,
			);
		}
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
