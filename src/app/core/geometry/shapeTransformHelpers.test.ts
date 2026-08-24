import { describe, expect, it } from "vitest";
import { containsTransformedPoint, hitShapeHandle, resizeGeometry, rotateGeometry, shapeHandles } from "./shapeTransformHelpers";

describe("shared shape transforms", () => {
  it("provides four resize handles and a rotation handle", () => {
    const shape = { rect: { x: 10, y: 20, width: 40, height: 30 }, rotation: 0 };
    expect(shapeHandles(shape)).toEqual({
      northWest: { x: 10, y: 20 }, northEast: { x: 50, y: 20 },
      southEast: { x: 50, y: 50 }, southWest: { x: 10, y: 50 }, rotate: { x: 30, y: -4 }
    });
    expect(hitShapeHandle(shape, { x: 51, y: 49 })).toBe("southEast");
    expect(hitShapeHandle(shape, { x: 30, y: -3 })).toBe("rotate");
  });

  it("resizes around the opposite corner and rotates around the center", () => {
    const shape = { rect: { x: 10, y: 20, width: 40, height: 30 }, rotation: 0 };
    resizeGeometry(shape, "southEast", { x: 70, y: 80 });
    expect(shape.rect).toEqual({ x: 10, y: 20, width: 60, height: 60 });
    rotateGeometry(shape, { x: 70, y: 50 });
    expect(shape.rotation).toBe(90);
    expect(containsTransformedPoint(shape, { x: 40, y: 50 })).toBe(true);
    expect(containsTransformedPoint(shape, { x: 75, y: 85 })).toBe(false);
  });
});
