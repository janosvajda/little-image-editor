import type { Point, Tool } from "../models/appTypes.js";

export interface StrokeOptions {
  color: string;
  size: number;
}

export function canvasPoint(event: PointerEvent, bounds: DOMRect, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(width, (event.clientX - bounds.left) * width / bounds.width)),
    y: Math.max(0, Math.min(height, (event.clientY - bounds.top) * height / bounds.height))
  };
}

export function configureStroke(context: CanvasRenderingContext2D, options: StrokeOptions): void {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = options.size;
  context.strokeStyle = options.color;
  context.fillStyle = options.color;
}

export function drawShape(context: CanvasRenderingContext2D, tool: Tool, from: Point, to: Point, fill: boolean): void {
  context.beginPath();
  if (tool === "line") { context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); }
  else if (tool === "rectangle" || tool === "crop") context.rect(from.x, from.y, to.x - from.x, to.y - from.y);
  else if (tool === "ellipse") context.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);

  if (tool === "crop") {
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.setLineDash([6, 4]);
    context.stroke();
    context.setLineDash([]);
  } else if (fill && tool !== "line") context.fill();
  else context.stroke();
}
