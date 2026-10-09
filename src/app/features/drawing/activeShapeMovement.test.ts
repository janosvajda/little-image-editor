import { describe, expect, it } from "vitest";
import { AnnotationDocument } from "../annotations/annotationDocument";
import { CanvasDocument } from "../../core/document/imageDocument";
import { DrawingController } from "./drawingController";

describe("active drawing-shape movement", () => {
  it("moves the selected shape by dragging it with Select", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!, overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    const model = new CanvasDocument(canvas, overlay); model.create({ name: "move", width: 200, height: 120, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) });
    const shapes = new AnnotationDocument();
    const drawing = new DrawingController(model, undefined, shapes); drawing.select("rectangle");
    drag(overlay, { x: 30, y: 30 }, { x: 70, y: 60 });
    drawing.select("select");
    drag(overlay, { x: 50, y: 45 }, { x: 80, y: 65 });
    expect(shapes.selected).toEqual(expect.objectContaining({ rect: { x: 60, y: 50, width: 40, height: 30 } }));
  });
});
function drag(target: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): void { for (const [type, point] of [["pointerdown", from], ["pointermove", to], ["pointerup", to]] as const) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y })); }
