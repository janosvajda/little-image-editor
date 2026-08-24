import {
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
	type PaintTool,
	type Point,
	type Tool,
} from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';

export interface StrokeOptions {
	color: string;
	size: number;
	opacity: number;
	hardness: number;
}

const PRESSURE_BASE = 0.35;
const PRESSURE_RANGE = 0.65;
const PENCIL_WIDTH_FACTOR = 0.22;
const MARKER_WIDTH_FACTOR = 1.35;
const MARKER_OPACITY_FACTOR = 0.55;
const HIGHLIGHTER_WIDTH_FACTOR = 2;
const HIGHLIGHTER_OPACITY_FACTOR = 0.25;
const SOFT_BRUSH_BLUR_FACTOR = 0.5;
const STAR_INNER_RADIUS_FACTOR = 0.42;
const FULL_CIRCLE_RADIANS = Math.PI * 2;
const HALF_DIVISOR = 2;
const SPRAY_MINIMUM_PARTICLES = 8;
const SPRAY_BASE_DENSITY = 8;
const SPRAY_HARDNESS_DENSITY = 12;
const SPRAY_DENSITY_DIVISOR = 10;
const CALLIGRAPHY_STEP_DIVISOR = 4;
const CALLIGRAPHY_THICKNESS_DIVISOR = 8;
const CALLIGRAPHY_ANGLE_DIVISOR = 4;
const CALLIGRAPHY_ANGLE = -Math.PI / CALLIGRAPHY_ANGLE_DIVISOR;
const ARROW_MINIMUM_LENGTH = 10;
const ARROW_LENGTH_FACTOR = 3;
const ARROW_ANGLE_DIVISOR = 6;
const ARROW_ANGLE = Math.PI / ARROW_ANGLE_DIVISOR;
const MAXIMUM_CORNER_RADIUS = 16;
const CORNER_RADIUS_DIVISOR = 4;
const STAR_POINT_COUNT = 10;
const STAR_ANGLE_STEP_DIVISOR = 5;
const CROP_DASH_LENGTH = 6;
const CROP_DASH_GAP = 4;

export function canvasPoint(
	event: Pick<PointerEvent, 'clientX' | 'clientY'>,
	bounds: DOMRect,
	width: number,
	height: number,
): Point {
	if (bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0)
		return { x: 0, y: 0 };
	return {
		x: Math.max(
			0,
			Math.min(width, ((event.clientX - bounds.left) * width) / bounds.width),
		),
		y: Math.max(
			0,
			Math.min(height, ((event.clientY - bounds.top) * height) / bounds.height),
		),
	};
}

export function configureStroke(
	context: CanvasRenderingContext2D,
	options: StrokeOptions,
): void {
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.lineWidth = options.size;
	context.strokeStyle = options.color;
	context.fillStyle = options.color;
	context.globalAlpha = options.opacity;
}

export function drawFreehandStroke(
	context: CanvasRenderingContext2D,
	tool: PaintTool,
	from: Point,
	to: Point,
	options: StrokeOptions,
	pressure = 1,
	random: () => number = Math.random,
): void {
	const pressureSize =
		options.size *
		(PRESSURE_BASE + PRESSURE_RANGE * Math.max(0, Math.min(1, pressure)));
	context.save();
	configureStroke(context, options);
	context.lineWidth = pressureSize;
	context.globalCompositeOperation =
		tool === PaintToolId.Eraser ? 'destination-out' : 'source-over';
	if (tool === PaintToolId.Spray)
		drawSpray(context, to, pressureSize, options.hardness, random);
	else if (tool === PaintToolId.Calligraphy)
		drawCalligraphy(context, from, to, pressureSize);
	else {
		if (tool === PaintToolId.Pencil) {
			context.lineWidth = Math.max(1, pressureSize * PENCIL_WIDTH_FACTOR);
			context.lineCap = 'square';
		}
		if (tool === PaintToolId.Marker) {
			context.lineWidth = pressureSize * MARKER_WIDTH_FACTOR;
			context.globalAlpha *= MARKER_OPACITY_FACTOR;
		}
		if (tool === PaintToolId.Highlighter) {
			context.lineWidth = pressureSize * HIGHLIGHTER_WIDTH_FACTOR;
			context.globalAlpha *= HIGHLIGHTER_OPACITY_FACTOR;
			context.lineCap = 'square';
		}
		if (tool === PaintToolId.Brush && options.hardness < 1) {
			context.shadowColor = options.color;
			context.shadowBlur =
				pressureSize * (1 - options.hardness) * SOFT_BRUSH_BLUR_FACTOR;
		}
		context.beginPath();
		context.moveTo(from.x, from.y);
		context.lineTo(to.x, to.y);
		context.stroke();
	}
	context.restore();
}

export function drawShape(
	context: CanvasRenderingContext2D,
	tool: Tool,
	from: Point,
	to: Point,
	fill: boolean,
): void {
	context.beginPath();
	if (tool === ShapeToolId.Line || tool === ShapeToolId.Arrow) {
		context.moveTo(from.x, from.y);
		context.lineTo(to.x, to.y);
		if (tool === ShapeToolId.Arrow) addArrowHead(context, from, to);
	} else if (tool === ShapeToolId.Rectangle || tool === UtilityToolId.Crop)
		context.rect(from.x, from.y, to.x - from.x, to.y - from.y);
	else if (tool === ShapeToolId.RoundedRectangle)
		addRoundedRectangle(context, from, to);
	else if (tool === ShapeToolId.Ellipse)
		context.ellipse(
			(from.x + to.x) / HALF_DIVISOR,
			(from.y + to.y) / HALF_DIVISOR,
			Math.abs(to.x - from.x) / HALF_DIVISOR,
			Math.abs(to.y - from.y) / HALF_DIVISOR,
			0,
			0,
			FULL_CIRCLE_RADIANS,
		);
	else if (tool === ShapeToolId.Triangle) {
		context.moveTo((from.x + to.x) / HALF_DIVISOR, from.y);
		context.lineTo(to.x, to.y);
		context.lineTo(from.x, to.y);
		context.closePath();
	} else if (tool === ShapeToolId.Diamond) {
		const center = {
			x: (from.x + to.x) / HALF_DIVISOR,
			y: (from.y + to.y) / HALF_DIVISOR,
		};
		context.moveTo(center.x, from.y);
		context.lineTo(to.x, center.y);
		context.lineTo(center.x, to.y);
		context.lineTo(from.x, center.y);
		context.closePath();
	} else if (tool === ShapeToolId.Star) addStar(context, from, to);
	if (tool === UtilityToolId.Crop) {
		context.save();
		context.strokeStyle = ColorPalette.White;
		context.globalAlpha = 1;
		context.lineWidth = 1;
		context.setLineDash([CROP_DASH_LENGTH, CROP_DASH_GAP]);
		context.stroke();
		context.restore();
	} else if (fill && tool !== ShapeToolId.Line && tool !== ShapeToolId.Arrow)
		context.fill();
	else context.stroke();
}

function drawSpray(
	context: CanvasRenderingContext2D,
	point: Point,
	size: number,
	hardness: number,
	random: () => number,
): void {
	const radius = size / HALF_DIVISOR,
		particles = Math.max(
			SPRAY_MINIMUM_PARTICLES,
			Math.round(
				(size * (SPRAY_BASE_DENSITY + hardness * SPRAY_HARDNESS_DENSITY)) /
					SPRAY_DENSITY_DIVISOR,
			),
		);
	for (let index = 0; index < particles; index += 1) {
		const angle = random() * FULL_CIRCLE_RADIANS,
			distance = Math.sqrt(random()) * radius,
			dot = Math.max(1, hardness * HALF_DIVISOR);
		context.fillRect(
			point.x + Math.cos(angle) * distance,
			point.y + Math.sin(angle) * distance,
			dot,
			dot,
		);
	}
}

function drawCalligraphy(
	context: CanvasRenderingContext2D,
	from: Point,
	to: Point,
	size: number,
): void {
	const distance = Math.hypot(to.x - from.x, to.y - from.y),
		steps = Math.max(
			1,
			Math.ceil(distance / Math.max(1, size / CALLIGRAPHY_STEP_DIVISOR)),
		);
	for (let index = 0; index <= steps; index += 1) {
		const progress = index / steps,
			x = from.x + (to.x - from.x) * progress,
			y = from.y + (to.y - from.y) * progress;
		context.beginPath();
		context.ellipse(
			x,
			y,
			size / HALF_DIVISOR,
			Math.max(1, size / CALLIGRAPHY_THICKNESS_DIVISOR),
			CALLIGRAPHY_ANGLE,
			0,
			FULL_CIRCLE_RADIANS,
		);
		context.fill();
	}
}

function addArrowHead(
	context: CanvasRenderingContext2D,
	from: Point,
	to: Point,
): void {
	const angle = Math.atan2(to.y - from.y, to.x - from.x),
		length = Math.max(
			ARROW_MINIMUM_LENGTH,
			context.lineWidth * ARROW_LENGTH_FACTOR,
		);
	context.moveTo(to.x, to.y);
	context.lineTo(
		to.x - length * Math.cos(angle - ARROW_ANGLE),
		to.y - length * Math.sin(angle - ARROW_ANGLE),
	);
	context.moveTo(to.x, to.y);
	context.lineTo(
		to.x - length * Math.cos(angle + ARROW_ANGLE),
		to.y - length * Math.sin(angle + ARROW_ANGLE),
	);
}

function addRoundedRectangle(
	context: CanvasRenderingContext2D,
	from: Point,
	to: Point,
): void {
	const left = Math.min(from.x, to.x),
		top = Math.min(from.y, to.y),
		width = Math.abs(to.x - from.x),
		height = Math.abs(to.y - from.y);
	const radius = Math.min(
		MAXIMUM_CORNER_RADIUS,
		width / CORNER_RADIUS_DIVISOR,
		height / CORNER_RADIUS_DIVISOR,
	);
	context.moveTo(left + radius, top);
	context.lineTo(left + width - radius, top);
	context.quadraticCurveTo(left + width, top, left + width, top + radius);
	context.lineTo(left + width, top + height - radius);
	context.quadraticCurveTo(
		left + width,
		top + height,
		left + width - radius,
		top + height,
	);
	context.lineTo(left + radius, top + height);
	context.quadraticCurveTo(left, top + height, left, top + height - radius);
	context.lineTo(left, top + radius);
	context.quadraticCurveTo(left, top, left + radius, top);
	context.closePath();
}

function addStar(
	context: CanvasRenderingContext2D,
	from: Point,
	to: Point,
): void {
	const centerX = (from.x + to.x) / HALF_DIVISOR,
		centerY = (from.y + to.y) / HALF_DIVISOR,
		outer =
			Math.min(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / HALF_DIVISOR;
	for (let point = 0; point < STAR_POINT_COUNT; point += 1) {
		const radius =
				point % HALF_DIVISOR === 0 ? outer : outer * STAR_INNER_RADIUS_FACTOR,
			angle =
				-Math.PI / HALF_DIVISOR + (point * Math.PI) / STAR_ANGLE_STEP_DIVISOR;
		const x = centerX + Math.cos(angle) * radius,
			y = centerY + Math.sin(angle) * radius;
		if (point === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.closePath();
}
