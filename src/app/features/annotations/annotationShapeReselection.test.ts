import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { AnnotationController } from "./annotationController";

describe("annotation shape reselection", () => {
  it("selects an older object and resets move, resize, and rotate cursors", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    addCanvasMethods(canvas.getContext("2d")!); addCanvasMethods(overlay.getContext("2d")!);
    const model = new CanvasDocument(canvas, overlay);
    model.create({ name: "annotations", width: 240, height: 140, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 140, right: 240, bottom: 140, x: 0, y: 0, toJSON: vi.fn() });
    const viewport = { addCanvasLayer(layer: HTMLCanvasElement) { addCanvasMethods(layer.getContext("2d")!); overlay.before(layer); } };
    const controller = new AnnotationController(model, viewport as never);
    controller.activate();
    controller.annotations.add(highlight("older", 20)); controller.annotations.add(highlight("newer", 120));
    controller.panel.toolButtons.get("highlight")!.click();

    pointer(overlay, "pointerdown", 40, 55); pointer(overlay, "pointerup", 40, 55);
    expect(controller.annotations.selectedId).toBe("older");
    pointer(overlay, "pointermove", 220, 120); expect(overlay.style.cursor).toBe("crosshair");

    controller.panel.toolButtons.get("select")!.click();
    pointer(overlay, "pointermove", 60, 70); expect(overlay.style.cursor).toBe("nwse-resize");
    pointer(overlay, "pointermove", 40, 16); expect(overlay.style.cursor).toContain("data:image/svg+xml");
    pointer(overlay, "pointermove", 40, 55); expect(overlay.style.cursor).toBe("move");
    pointer(overlay, "pointermove", 220, 120); expect(overlay.style.cursor).toBe("default");
    pointer(overlay, "pointerleave", 250, 150); expect(overlay.style.cursor).toBe("default");
  });
});

function highlight(id: string, x: number) {
  return { id, type: "highlight" as const, rect: { x, y: 40, width: 40, height: 30 }, color: "#f00", width: 2, opacity: .4, blur: 8 };
}
function pointer(target: HTMLElement, type: string, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
}
function addCanvasMethods(context: CanvasRenderingContext2D): void {
  for (const method of ["arc", "fillText", "clip", "translate", "rotate"] as const) if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
}
