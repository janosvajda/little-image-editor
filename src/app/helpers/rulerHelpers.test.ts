import { describe, expect, it } from "vitest";
import { pixelsToUnit, rulerStep, rulerTicks, unitToPixels } from "./rulerHelpers";

describe("rulerHelpers", () => {
  it("converts pixels, millimetres, centimetres, and inches at 96 PPI", () => {
    expect(pixelsToUnit(96, "in")).toBe(1);
    expect(pixelsToUnit(96, "cm")).toBeCloseTo(2.54);
    expect(pixelsToUnit(96, "mm")).toBeCloseTo(25.4);
    expect(unitToPixels(25.4, "mm")).toBeCloseTo(96);
    expect(unitToPixels(10, "px")).toBe(10);
  });

  it("selects readable steps and scales tick positions with zoom", () => {
    expect(rulerStep(1, "px")).toBe(100);
    expect(rulerStep(2, "px")).toBe(50);
    expect(rulerTicks(200, 2, "px")).toEqual([
      { pixelPosition: 0, label: "0" }, { pixelPosition: 100, label: "50" },
      { pixelPosition: 200, label: "100" }, { pixelPosition: 300, label: "150" }, { pixelPosition: 400, label: "200" }
    ]);
    expect(rulerTicks(0, 1, "px")).toEqual([]);
  });
});
