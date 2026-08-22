import { describe, expect, it } from "vitest";
import { canvasContext, element, elements } from "./domHelpers.js";

describe("DOM helpers", () => {
  it("returns typed required elements and lists", () => {
    expect(element("#canvas")).toBeInstanceOf(HTMLCanvasElement);
    expect(elements(".panel")).toHaveLength(3);
    expect(canvasContext(element<HTMLCanvasElement>("#canvas"))).toBeTruthy();
  });

  it("fails clearly for missing required elements", () => {
    expect(() => element("#missing")).toThrow("Required element not found: #missing");
  });
});
