import type { Point } from '../../core/document/appTypes';
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
	shapeHandles,
	withShapeTransform,
} from '../../core/geometry/shapeTransformHelpers';
import { genericShape } from '../../core/geometry/genericShape';
import { ColorPalette } from '../../core/document/colorPalette';
import { textFont } from '../../core/geometry/textShapeMetrics';

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
} as const;

export function renderAnnotations(
	context: CanvasRenderingContext2D,
	baseCanvas: HTMLCanvasElement,
	state: Readonly<AnnotationState>,
	selectedId: string | null = null,
): void {
	state.objects.forEach((object) => renderObject(context, baseCanvas, object));
	const selected = state.objects.find((object) => object.id === selectedId);
	if (selected) renderSelection(context, selected);
}

function renderObject(
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

function renderSelection(
	context: CanvasRenderingContext2D,
	object: AnnotationObject,
): void {
	const bounds = annotationBounds(object);
	context.save();
	context.strokeStyle = ColorPalette.Selection;
	context.lineWidth = AnnotationRendering.SelectionLineWidth;
	context.setLineDash([
		AnnotationRendering.SelectionDash,
		AnnotationRendering.SelectionGap,
	]);
	const geometry = genericShape(object).geometry;
	withShapeTransform(context, geometry, () =>
		strokeRectangle(context, bounds.x, bounds.y, bounds.width, bounds.height),
	);
	context.setLineDash([]);
	context.fillStyle = ColorPalette.White;
	context.strokeStyle = ColorPalette.Selection;
	const handles = shapeHandles(genericShape(object).geometry);
	for (const [key, point] of Object.entries(handles)) {
		if (key === ShapeHandleId.Rotate) {
			context.fillRect(
				point.x - AnnotationRendering.RotateHandleHalfSize,
				point.y - AnnotationRendering.RotateHandleHalfSize,
				AnnotationRendering.RotateHandleSize,
				AnnotationRendering.RotateHandleSize,
			);
			strokeRectangle(
				context,
				point.x - AnnotationRendering.RotateHandleHalfSize,
				point.y - AnnotationRendering.RotateHandleHalfSize,
				AnnotationRendering.RotateHandleSize,
				AnnotationRendering.RotateHandleSize,
			);
		} else {
			context.fillRect(
				point.x - AnnotationRendering.ResizeHandleHalfSize,
				point.y - AnnotationRendering.ResizeHandleHalfSize,
				AnnotationRendering.ResizeHandleSize,
				AnnotationRendering.ResizeHandleSize,
			);
			strokeRectangle(
				context,
				point.x - AnnotationRendering.ResizeHandleHalfSize,
				point.y - AnnotationRendering.ResizeHandleHalfSize,
				AnnotationRendering.ResizeHandleSize,
				AnnotationRendering.ResizeHandleSize,
			);
		}
	}
	context.restore();
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
