import { describe, expect, it, vi } from "vitest";
import { MarkupToolId, UtilityToolId } from "../../core/document/appTypes";
import { CanvasDocument } from "../../core/document/imageDocument";
import { DrawingController } from "../drawing/drawingController";
import { AnnotationDocument } from "./annotationDocument";
import { AnnotationObjectTypeId, type RectAnnotation } from "./annotationTypes";

describe("annotation shape reselection", () => {
  it("selects an older object and resets move, resize, and rotate cursors", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    addCanvasMethods(canvas.getContext("2d")!); addCanvasMethods(overlay.getContext("2d")!);
    const model = new CanvasDocument(canvas, overlay);
    model.create({ name: "annotations", width: 240, height: 140, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 140, right: 240, bottom: 140, x: 0, y: 0, toJSON: vi.fn() });
    const objects = new AnnotationDocument();
    const drawing = new DrawingController(model, undefined, objects);
    objects.add(highlight("older", 20)); objects.createLayer(); objects.add(highlight("newer", 120));
    drawing.select(MarkupToolId.Highlight);
    pointer(overlay, "pointermove", 220, 120); expect(overlay.style.cursor).toBe("crosshair");

    drawing.select(UtilityToolId.Select);
    click(overlay, 40, 55);
    expect(objects.selectedLayer?.id).toBe(objects.layerOf("older")?.id);
    click(overlay, 40, 55);
    expect(objects.selected?.id).toBe("older");
    pointer(overlay, "pointermove", 60, 70); expect(overlay.style.cursor).toBe("nwse-resize");
    pointer(overlay, "pointermove", 40, 16); expect(overlay.style.cursor).toContain("data:image/svg+xml");
    pointer(overlay, "pointermove", 40, 55); expect(overlay.style.cursor).toBe("move");
    pointer(overlay, "pointermove", 220, 120); expect(overlay.style.cursor).toBe("default");
    pointer(overlay, "pointerleave", 250, 150); expect(overlay.style.cursor).toBe("default");
  });
});

function highlight(id: string, x: number): RectAnnotation {
  return { id, type: AnnotationObjectTypeId.Highlight, rect: { x, y: 40, width: 40, height: 30 }, color: "#f00", width: 2, opacity: .4, blur: 8 };
}
function click(target: HTMLElement, x: number, y: number): void { pointer(target, "pointerdown", x, y); pointer(target, "pointerup", x, y); }
function pointer(target: HTMLElement, type: string, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
}
function addCanvasMethods(context: CanvasRenderingContext2D): void {
  for (const method of ["arc", "fillText", "clip", "translate", "rotate"] as const) if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
}
