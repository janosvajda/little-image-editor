import { describe, expect, it, vi } from "vitest";
import { UtilityToolId } from "../../core/document/appTypes";
import { CanvasDocument } from "../../core/document/imageDocument";
import { genericShape } from "../../core/geometry/genericShape";
import { shapeCenter } from "../../core/geometry/shapeTransformHelpers";
import { DrawingController } from "../drawing/drawingController";
import { AnnotationDocument } from "./annotationDocument";
import { AnnotationObjectTypeId } from "./annotationTypes";

describe("cross-type generic annotation editing", () => {
  it("moves and transforms text and a differently typed previous shape", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    addCanvasMethods(canvas.getContext("2d")!); addCanvasMethods(overlay.getContext("2d")!);
    const model = new CanvasDocument(canvas, overlay);
    model.create({ name: "cross-type", width: 260, height: 160, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 260, height: 160, right: 260, bottom: 160, x: 0, y: 0, toJSON: vi.fn() });
    const objects = new AnnotationDocument();
    const drawing = new DrawingController(model, undefined, objects);
    objects.add({ id: "text", type: AnnotationObjectTypeId.Text, at: { x: 20, y: 80 }, text: "Editable", color: "#fff", size: 20 });
    objects.add({ id: "box", type: AnnotationObjectTypeId.Box, rect: { x: 150, y: 40, width: 50, height: 40 }, color: "#f00", width: 3, opacity: 1, blur: 8 });
    drawing.select(UtilityToolId.Select);

    clickLayerThenItem(overlay, 45, 68);
    expect(objects.selected?.id).toBe("text");
    const textCenter = shapeCenter(genericShape(objects.selected!).geometry);
    drag(overlay, textCenter, { x: textCenter.x + 20, y: textCenter.y + 10 });
    const movedText = objects.object("text")!;
    expect(movedText.type === AnnotationObjectTypeId.Text && movedText.at.x).toBeGreaterThan(20);

    click(overlay, 175, 60);
    expect(objects.selected?.id).toBe("box");
    drag(overlay, { x: 200, y: 80 }, { x: 225, y: 105 });
    expect(objects.selected).toEqual(expect.objectContaining({ type: AnnotationObjectTypeId.Box, rect: expect.objectContaining({ width: 75, height: 65 }) }));
    drag(overlay, { x: 187.5, y: 16 }, { x: 230, y: 72.5 });
    expect((objects.selected as { rotation?: number }).rotation).toBeGreaterThan(0);
  });
});

function click(target: HTMLElement, x: number, y: number): void { pointer(target, "pointerdown", x, y); pointer(target, "pointerup", x, y); }
function clickLayerThenItem(target: HTMLElement, x: number, y: number): void { click(target, x, y); click(target, x, y); }
function drag(target: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): void { pointer(target, "pointerdown", from.x, from.y); pointer(target, "pointermove", to.x, to.y); pointer(target, "pointerup", to.x, to.y); }
function pointer(target: HTMLElement, type: string, x: number, y: number): void { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })); }
function addCanvasMethods(context: CanvasRenderingContext2D): void { for (const method of ["arc", "fillText", "clip", "translate", "rotate", "strokeRect"] as const) if (!(method in context)) Object.assign(context, { [method]: vi.fn() }); }
