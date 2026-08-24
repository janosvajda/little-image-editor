import { describe, expect, it } from "vitest";
import { ArrowShape, GenericShape, RectShape, StepShape, TextShape, genericShape } from "./genericShape";
import type { AnnotationObject } from "../annotations/annotationTypes";

describe("generic shape inheritance contract", () => {
  it("wraps every retained shape family in a GenericShape subclass", () => {
    const objects: AnnotationObject[] = [
      { id: "drawing", type: "shape", shape: "star", rect: { x: 0, y: 0, width: 20, height: 20 }, color: "#000", width: 2, opacity: 1, fill: false },
      { id: "box", type: "highlight", rect: { x: 0, y: 0, width: 20, height: 20 }, color: "#ff0", width: 2, opacity: .4, blur: 4 },
      { id: "arrow", type: "arrow", from: { x: 0, y: 0 }, to: { x: 20, y: 20 }, color: "#000", width: 2 },
      { id: "step", type: "step", at: { x: 10, y: 10 }, value: 1, color: "#000", size: 20 },
      { id: "text", type: "text", at: { x: 0, y: 20 }, text: "Text", color: "#000", size: 16 }
    ];
    const shapes = objects.map(genericShape);
    expect(shapes.every(shape => shape instanceof GenericShape)).toBe(true);
    expect(shapes.map(shape => shape.constructor)).toEqual([RectShape, RectShape, ArrowShape, StepShape, TextShape]);
    for (const shape of shapes) {
      const before = shape.geometry.rect;
      shape.move({ x: 5, y: 7 });
      expect(shape.geometry.rect.x).toBeCloseTo(before.x + 5);
      expect(shape.geometry.rect.y).toBeCloseTo(before.y + 7);
      shape.transform("southEast", { x: 80, y: 70 });
      shape.transform("rotate", { x: 90, y: 50 });
      expect(shape.object.rotation).toBeTypeOf("number");
      expect(Object.keys(shape.handles)).toEqual(["northWest", "northEast", "southEast", "southWest", "rotate"]);
    }
  });
});
