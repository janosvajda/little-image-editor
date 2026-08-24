import { describe, expect, it } from "vitest";
import { AnnotationDocument } from "../annotations/annotationDocument";
import { CanvasDocument } from "../../core/document/imageDocument";
import { DrawingController } from "./drawingController";

describe("shared shape selection cursors", () => {
  it("reselects an older shape and exposes move, resize, and rotate cursors", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    const model = new CanvasDocument(canvas, overlay);
    model.create({ name: "selection", width: 200, height: 120, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) });
    const shapes = new AnnotationDocument();
    shapes.add(shape("older", 10, 30));
    shapes.add(shape("newer", 100, 30));
    const drawing = new DrawingController(model, undefined, shapes);
    drawing.select("select");

    pointer(overlay, "pointermove", 30, 45);
    expect(overlay.style.cursor).toBe("move");
    pointer(overlay, "pointerdown", 30, 45); pointer(overlay, "pointerup", 30, 45);
    expect(shapes.selectedId).toBe("older");

    pointer(overlay, "pointermove", 50, 60);
    expect(overlay.style.cursor).toBe("nwse-resize");
    pointer(overlay, "pointermove", 30, 6);
    expect(overlay.style.cursor).toContain("data:image/svg+xml");
  });
});

function shape(id: string, x: number, y: number) {
  return { id, type: "shape" as const, shape: "rectangle" as const, rect: { x, y, width: 40, height: 30 }, rotation: 0, color: "#000", width: 2, opacity: 1, fill: false };
}
function pointer(target: HTMLElement, type: string, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
}
