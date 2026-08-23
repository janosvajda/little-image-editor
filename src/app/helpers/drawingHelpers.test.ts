import { describe, expect, it, vi } from "vitest";
import type { PaintTool, ShapeTool } from "../models/appTypes";
import { canvasPoint, configureStroke, drawFreehandStroke, drawShape, type StrokeOptions } from "./drawingHelpers";

const options: StrokeOptions = { color: "#123456", size: 20, opacity: .8, hardness: .5 };
const from = { x: 10, y: 20 };
const to = { x: 90, y: 80 };

function context(): CanvasRenderingContext2D {
  return document.querySelector<HTMLCanvasElement>("#canvas")!.getContext("2d")!;
}

describe("drawingHelpers", () => {
  it("maps and clamps pointer coordinates to the canvas", () => {
    const bounds = { left: 10, top: 20, width: 100, height: 50 } as DOMRect;
    expect(canvasPoint({ clientX: 60, clientY: 45 } as PointerEvent, bounds, 200, 100)).toEqual({ x: 100, y: 50 });
    expect(canvasPoint({ clientX: -20, clientY: 200 } as PointerEvent, bounds, 200, 100)).toEqual({ x: 0, y: 100 });
    expect(canvasPoint({ clientX: 20, clientY: 20 } as PointerEvent, { ...bounds, width: 0 } as DOMRect, 200, 100)).toEqual({ x: 0, y: 0 });
  });

  it.each([.1, .25, .5, 1, 1.25, 2, 3, 4, 8])("maps the same image pixel at %sx zoom", zoom => {
    const image = { width: 800, height: 600 };
    const bounds = { left: 37, top: 53, width: image.width * zoom, height: image.height * zoom } as DOMRect;
    const event = { clientX: bounds.left + 320 * zoom, clientY: bounds.top + 240 * zoom } as PointerEvent;
    expect(canvasPoint(event, bounds, image.width, image.height)).toEqual({ x: 320, y: 240 });
  });

  it("configures color, size, opacity, and rounded strokes", () => {
    const target = context();
    configureStroke(target, options);
    expect(target).toMatchObject({ lineCap: "round", lineJoin: "round", lineWidth: 20, strokeStyle: "#123456", fillStyle: "#123456", globalAlpha: .8 });
  });

  it.each<PaintTool>(["pencil", "brush", "marker", "highlighter", "calligraphy", "spray", "eraser"])("renders the %s paint engine", tool => {
    const target = context();
    drawFreehandStroke(target, tool, from, to, options, tool === "pencil" ? -1 : 2, () => .5);
    expect(vi.mocked(target.save)).toHaveBeenCalled();
    expect(vi.mocked(target.restore)).toHaveBeenCalled();
    if (tool === "spray") expect(vi.mocked(target.fillRect)).toHaveBeenCalled();
    else if (tool === "calligraphy") expect(vi.mocked(target.ellipse)).toHaveBeenCalled();
    else expect(vi.mocked(target.stroke)).toHaveBeenCalled();
  });

  it("renders a hard brush without adding softness", () => {
    const target = context();
    drawFreehandStroke(target, "brush", from, to, { ...options, hardness: 1 });
    expect(vi.mocked(target.stroke)).toHaveBeenCalledOnce();
  });

  it.each<ShapeTool>(["line", "arrow", "rectangle", "roundedRectangle", "ellipse", "triangle", "diamond", "star"])("constructs the %s shape", tool => {
    const target = context();
    configureStroke(target, options);
    drawShape(target, tool, from, to, false);
    expect(vi.mocked(target.stroke)).toHaveBeenCalled();
  });

  it("fills closed shapes and renders the crop marquee independently", () => {
    const target = context();
    drawShape(target, "rectangle", from, to, true);
    drawShape(target, "line", from, to, true);
    drawShape(target, "crop", from, to, false);
    expect(vi.mocked(target.fill)).toHaveBeenCalledOnce();
    expect(vi.mocked(target.setLineDash)).toHaveBeenCalledWith([6, 4]);
  });
});
