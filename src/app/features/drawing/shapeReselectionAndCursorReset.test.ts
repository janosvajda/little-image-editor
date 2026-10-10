import { describe, expect, it } from "vitest";
import { ShapeToolId, UtilityToolId } from "../../core/document/appTypes";
import { CanvasDocument } from "../../core/document/imageDocument";
import { AnnotationDocument } from "../annotations/annotationDocument";
import { AnnotationObjectTypeId, type ShapeAnnotation } from "../annotations/annotationTypes";
import { DrawingController } from "./drawingController";

const CanvasFixture = {
  Width: 240,
  Height: 140,
  Background: "#fff"
} as const;

const ShapeFixture = {
  OlderX: 20,
  NewerX: 120,
  Y: 40,
  Width: 40,
  Height: 30,
  StrokeColor: "#000",
  StrokeWidth: 2,
  Opacity: 1
} as const;

const PointerFixture = {
  OlderShape: { x: 40, y: 55 },
  ResizeHandle: { x: 60, y: 70 },
  EmptyCanvas: { x: 220, y: 120 },
  OutsideCanvas: { x: 250, y: 150 }
} as const;

const PointerEventType = {
  Down: "pointerdown",
  Leave: "pointerleave",
  Move: "pointermove",
  Up: "pointerup"
} as const;

describe("retained shape reselection", () => {
  it("selects an older shape with a click and clears transform cursors away from it", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    const model = new CanvasDocument(canvas, overlay);
    model.create({ name: "reselection", width: CanvasFixture.Width, height: CanvasFixture.Height, transparent: false, background: CanvasFixture.Background });
    overlay.getBoundingClientRect = () => ({
      left: 0, top: 0, width: CanvasFixture.Width, height: CanvasFixture.Height,
      right: CanvasFixture.Width, bottom: CanvasFixture.Height, x: 0, y: 0, toJSON: () => ({})
    });
    const shapes = new AnnotationDocument();
    shapes.add(shape("older", ShapeFixture.OlderX)); shapes.createLayer(); shapes.add(shape("newer", ShapeFixture.NewerX));
    const drawing = new DrawingController(model, undefined, shapes);
    drawing.select(ShapeToolId.Rectangle);

    pointer(overlay, PointerEventType.Down, PointerFixture.OlderShape);
    pointer(overlay, PointerEventType.Up, PointerFixture.OlderShape);
    expect(shapes.selectedId).toBe("older");

    drawing.select(UtilityToolId.Select);
    pointer(overlay, PointerEventType.Move, PointerFixture.ResizeHandle);
    expect(overlay.style.cursor).toBe("nwse-resize");
    pointer(overlay, PointerEventType.Move, PointerFixture.EmptyCanvas);
    expect(overlay.style.cursor).toBe("default");
    pointer(overlay, PointerEventType.Leave, PointerFixture.OutsideCanvas);
    expect(overlay.style.cursor).toBe("default");
  });
});

function shape(id: string, x: number): ShapeAnnotation {
  return {
    id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle,
    rect: { x, y: ShapeFixture.Y, width: ShapeFixture.Width, height: ShapeFixture.Height },
    color: ShapeFixture.StrokeColor, width: ShapeFixture.StrokeWidth, opacity: ShapeFixture.Opacity, fill: false
  };
}
function pointer(target: HTMLElement, type: string, point: { readonly x: number; readonly y: number }): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y }));
}
