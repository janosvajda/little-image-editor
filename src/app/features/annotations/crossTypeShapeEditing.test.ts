import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { genericShape } from "../../core/geometry/genericShape";
import { AnnotationController } from "./annotationController";

describe("cross-type generic annotation editing", () => {
  it("moves and transforms text and a differently typed previous shape", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    addCanvasMethods(canvas.getContext("2d")!); addCanvasMethods(overlay.getContext("2d")!);
    const model = new CanvasDocument(canvas, overlay);
    model.create({ name: "cross-type", width: 260, height: 160, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 260, height: 160, right: 260, bottom: 160, x: 0, y: 0, toJSON: vi.fn() });
    const viewport = { addCanvasLayer(layer: HTMLCanvasElement) { addCanvasMethods(layer.getContext("2d")!); overlay.before(layer); } };
    const controller = new AnnotationController(model, viewport as never);
    controller.activate();
    controller.annotations.add({ id: "text", type: "text", at: { x: 20, y: 80 }, text: "Editable", color: "#fff", size: 20 });
    controller.annotations.add({ id: "box", type: "box", rect: { x: 150, y: 40, width: 50, height: 40 }, color: "#f00", width: 3, opacity: 1, blur: 8 });
    controller.panel.toolButtons.get("highlight")!.click();

    click(overlay, 45, 68);
    expect(controller.annotations.selectedId).toBe("text");
    const moveHandle = genericShape(controller.annotations.selected!).moveHandle();
    drag(overlay, moveHandle, { x: moveHandle.x + 20, y: moveHandle.y + 10 });
    const movedText = controller.annotations.selected!;
    expect(movedText.type === "text" && movedText.at.x).toBeGreaterThan(20);

    const textBounds = controller.annotations.selected!;
    expect(textBounds.type).toBe("text");
    click(overlay, 175, 60);
    expect(controller.annotations.selectedId).toBe("box");
    drag(overlay, { x: 200, y: 80 }, { x: 225, y: 105 });
    expect(controller.annotations.selected).toEqual(expect.objectContaining({ type: "box", rect: expect.objectContaining({ width: 75, height: 65 }) }));
    drag(overlay, { x: 187.5, y: 16 }, { x: 230, y: 72.5 });
    expect((controller.annotations.selected as { rotation?: number }).rotation).toBeGreaterThan(0);
  });
});

function click(target: HTMLElement, x: number, y: number): void { pointer(target, "pointerdown", x, y); pointer(target, "pointerup", x, y); }
function drag(target: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): void { pointer(target, "pointerdown", from.x, from.y); pointer(target, "pointermove", to.x, to.y); pointer(target, "pointerup", to.x, to.y); }
function pointer(target: HTMLElement, type: string, x: number, y: number): void { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })); }
function addCanvasMethods(context: CanvasRenderingContext2D): void { for (const method of ["arc", "fillText", "clip", "translate", "rotate", "strokeRect"] as const) if (!(method in context)) Object.assign(context, { [method]: vi.fn() }); }
