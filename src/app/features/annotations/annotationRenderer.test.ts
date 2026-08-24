import { describe, expect, it, vi } from "vitest";
import { renderAnnotations } from "./annotationRenderer";
import type { AnnotationObject } from "./annotationTypes";

function drawingContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    arc: vi.fn(), fillText: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), rect: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), setLineDash: vi.fn()
  } as unknown as CanvasRenderingContext2D;
}

describe("annotation renderer", () => {
  it("renders every public annotation type and selection handles", () => {
    const context = drawingContext();
    const base = document.createElement("canvas");
    const rect = { x: 20, y: 30, width: 80, height: 40 };
    const objects: AnnotationObject[] = [
      { id: "arrow", type: "arrow", from: { x: 1, y: 2 }, to: { x: 30, y: 40 }, color: "#f00", width: 3 },
      { id: "step-dark", type: "step", at: { x: 40, y: 50 }, value: 1, color: "#111111", size: 24 },
      { id: "step-light", type: "step", at: { x: 70, y: 50 }, value: 2, color: "#ffffff", size: 24 },
      { id: "text", type: "text", at: { x: 5, y: 8 }, text: "Found it", color: "#00f", size: 16 },
      { id: "box", type: "box", rect, color: "#f00", width: 2, opacity: 1, blur: 8 },
      { id: "highlight", type: "highlight", rect, color: "#ff0", width: 2, opacity: .4, blur: 8 },
      { id: "blur", type: "blur", rect, color: "#000", width: 2, opacity: 1, blur: 12 },
      { id: "redact", type: "redact", rect, color: "#000", width: 2, opacity: 1, blur: 8 }
    ];
    renderAnnotations(context, base, { objects, nextStep: 3 }, "box");
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith("1", 40, expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("Found it", 5, 8);
    expect(context.strokeRect).toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.setLineDash).toHaveBeenCalledWith([5, 4]);
  });

  it("does nothing for selection when the id is absent", () => {
    const context = drawingContext();
    renderAnnotations(context, document.createElement("canvas"), { objects: [], nextStep: 1 }, "missing");
    expect(context.strokeRect).not.toHaveBeenCalled();
  });
});
