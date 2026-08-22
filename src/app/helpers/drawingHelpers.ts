import type { PaintTool, Point, Tool } from "../models/appTypes";

export interface StrokeOptions { color: string; size: number; opacity: number; hardness: number; }

export function canvasPoint(event: PointerEvent, bounds: DOMRect, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(width, (event.clientX - bounds.left) * width / bounds.width)),
    y: Math.max(0, Math.min(height, (event.clientY - bounds.top) * height / bounds.height))
  };
}

export function configureStroke(context: CanvasRenderingContext2D, options: StrokeOptions): void {
  context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = options.size;
  context.strokeStyle = options.color; context.fillStyle = options.color; context.globalAlpha = options.opacity;
}

export function drawFreehandStroke(context: CanvasRenderingContext2D, tool: PaintTool, from: Point, to: Point, options: StrokeOptions, pressure = 1, random: () => number = Math.random): void {
  const pressureSize = options.size * (.35 + .65 * Math.max(0, Math.min(1, pressure)));
  context.save(); configureStroke(context, { ...options, size: pressureSize });
  context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  if (tool === "spray") drawSpray(context, to, pressureSize, options.hardness, random);
  else if (tool === "calligraphy") drawCalligraphy(context, from, to, pressureSize);
  else {
    if (tool === "pencil") { context.lineWidth = Math.max(1, pressureSize * .22); context.lineCap = "square"; }
    if (tool === "marker") { context.lineWidth = pressureSize * 1.35; context.globalAlpha *= .55; }
    if (tool === "highlighter") { context.lineWidth = pressureSize * 2; context.globalAlpha *= .25; context.lineCap = "square"; }
    if (tool === "brush" && options.hardness < 1) { context.shadowColor = options.color; context.shadowBlur = pressureSize * (1 - options.hardness) * .5; }
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
  }
  context.restore();
}

export function drawShape(context: CanvasRenderingContext2D, tool: Tool, from: Point, to: Point, fill: boolean): void {
  context.beginPath();
  if (tool === "line" || tool === "arrow") {
    context.moveTo(from.x, from.y); context.lineTo(to.x, to.y);
    if (tool === "arrow") addArrowHead(context, from, to);
  } else if (tool === "rectangle" || tool === "crop") context.rect(from.x, from.y, to.x - from.x, to.y - from.y);
  else if (tool === "roundedRectangle") addRoundedRectangle(context, from, to);
  else if (tool === "ellipse") context.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
  else if (tool === "triangle") { context.moveTo((from.x + to.x) / 2, from.y); context.lineTo(to.x, to.y); context.lineTo(from.x, to.y); context.closePath(); }
  else if (tool === "diamond") {
    const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    context.moveTo(center.x, from.y); context.lineTo(to.x, center.y); context.lineTo(center.x, to.y); context.lineTo(from.x, center.y); context.closePath();
  } else if (tool === "star") addStar(context, from, to);
  if (tool === "crop") {
    context.save(); context.strokeStyle = "#ffffff"; context.globalAlpha = 1; context.lineWidth = 1;
    context.setLineDash([6, 4]); context.stroke(); context.restore();
  } else if (fill && tool !== "line" && tool !== "arrow") context.fill();
  else context.stroke();
}

function drawSpray(context: CanvasRenderingContext2D, point: Point, size: number, hardness: number, random: () => number): void {
  const radius = size / 2, particles = Math.max(8, Math.round(size * (8 + hardness * 12) / 10));
  for (let index = 0; index < particles; index += 1) {
    const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * radius, dot = Math.max(1, hardness * 2);
    context.fillRect(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance, dot, dot);
  }
}

function drawCalligraphy(context: CanvasRenderingContext2D, from: Point, to: Point, size: number): void {
  const distance = Math.hypot(to.x - from.x, to.y - from.y), steps = Math.max(1, Math.ceil(distance / Math.max(1, size / 4)));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps, x = from.x + (to.x - from.x) * progress, y = from.y + (to.y - from.y) * progress;
    context.beginPath(); context.ellipse(x, y, size / 2, Math.max(1, size / 8), -Math.PI / 4, 0, Math.PI * 2); context.fill();
  }
}

function addArrowHead(context: CanvasRenderingContext2D, from: Point, to: Point): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x), length = Math.max(10, context.lineWidth * 3);
  context.moveTo(to.x, to.y); context.lineTo(to.x - length * Math.cos(angle - Math.PI / 6), to.y - length * Math.sin(angle - Math.PI / 6));
  context.moveTo(to.x, to.y); context.lineTo(to.x - length * Math.cos(angle + Math.PI / 6), to.y - length * Math.sin(angle + Math.PI / 6));
}

function addRoundedRectangle(context: CanvasRenderingContext2D, from: Point, to: Point): void {
  const left = Math.min(from.x, to.x), top = Math.min(from.y, to.y), width = Math.abs(to.x - from.x), height = Math.abs(to.y - from.y);
  const radius = Math.min(16, width / 4, height / 4);
  context.moveTo(left + radius, top); context.lineTo(left + width - radius, top); context.quadraticCurveTo(left + width, top, left + width, top + radius);
  context.lineTo(left + width, top + height - radius); context.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
  context.lineTo(left + radius, top + height); context.quadraticCurveTo(left, top + height, left, top + height - radius);
  context.lineTo(left, top + radius); context.quadraticCurveTo(left, top, left + radius, top); context.closePath();
}

function addStar(context: CanvasRenderingContext2D, from: Point, to: Point): void {
  const centerX = (from.x + to.x) / 2, centerY = (from.y + to.y) / 2, outer = Math.min(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / 2;
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outer : outer * .42, angle = -Math.PI / 2 + point * Math.PI / 5;
    const x = centerX + Math.cos(angle) * radius, y = centerY + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
}
