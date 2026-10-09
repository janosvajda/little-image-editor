import { describe, expect, it } from "vitest";
import { AnnotationDocument } from "../annotations/annotationDocument";
import { CanvasDocument } from "../../core/document/imageDocument";
import { DrawingController } from "./drawingController";

describe("generic drawing-shape editing", () => {
  it("keeps a shape editable through resize, rotate, undo, and redo", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    const model = new CanvasDocument(canvas, overlay);
    model.create({ name: "shapes", width: 200, height: 100, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const shapes = new AnnotationDocument();
    const drawing = new DrawingController(model, undefined, shapes);
    drawing.select("rectangle");

    pointer(overlay, "pointerdown", 10, 20); pointer(overlay, "pointermove", 50, 50); pointer(overlay, "pointerup", 50, 50);
    expect(shapes.selected).toEqual(expect.objectContaining({ type: "shape", shape: "rectangle", rect: { x: 10, y: 20, width: 40, height: 30 } }));
    drawing.select("select");

    pointer(overlay, "pointerdown", 50, 50); pointer(overlay, "pointermove", 70, 80); pointer(overlay, "pointerup", 70, 80);
    expect(shapes.selected).toEqual(expect.objectContaining({ rect: { x: 10, y: 20, width: 60, height: 60 } }));

    pointer(overlay, "pointerdown", 40, -4); pointer(overlay, "pointermove", 70, 50); pointer(overlay, "pointerup", 70, 50);
    expect((shapes.selected as { rotation?: number }).rotation).toBe(90);
    shapes.undo(); expect((shapes.selected as { rotation?: number } | null)?.rotation).not.toBe(90);
    shapes.redo(); expect(shapes.state.objects[0]).toEqual(expect.objectContaining({ rotation: 90 }));
  });
});

function pointer(target: HTMLElement, type: string, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
}
