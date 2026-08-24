import { describe, expect, it, vi } from "vitest";
import { floodFill } from "./floodFillHelpers";

function fillContext(width: number, height: number, values: number[]): { context: CanvasRenderingContext2D; pixels: Uint8ClampedArray } {
  const pixels = new Uint8ClampedArray(values);
  const context = {
    getImageData: vi.fn(() => new ImageData(new Uint8ClampedArray(pixels), width, height)),
    putImageData: vi.fn((image: ImageData) => pixels.set(image.data))
  } as unknown as CanvasRenderingContext2D;
  return { context, pixels };
}

describe("floodFill", () => {
  it("fills only the contiguous matching region", () => {
    const white = [255, 255, 255, 255], black = [0, 0, 0, 255];
    const subject = fillContext(3, 3, [...white, ...white, ...black, ...white, ...black, ...black, ...white, ...white, ...white]);
    expect(floodFill(subject.context, 3, 3, 0, 0, { color: "#ff0000", opacity: 1, tolerance: 0 })).toBe(true);
    expect([...subject.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...subject.pixels.slice(8, 12)]).toEqual(black);
    expect([...subject.pixels.slice(12, 16)]).toEqual([255, 0, 0, 255]);
  });

  it("uses tolerance and alpha compositing", () => {
    const subject = fillContext(2, 1, [100, 100, 100, 255, 115, 110, 105, 255]);
    floodFill(subject.context, 2, 1, 0, 0, { color: "#ffffff", opacity: .5, tolerance: 15 });
    expect(subject.pixels[0]).toBeGreaterThan(100);
    expect(subject.pixels[4]).toBeGreaterThan(115);
  });

  it("handles transparent regions, no-op colors, and invalid coordinates", () => {
    const subject = fillContext(2, 1, [40, 50, 60, 0, 200, 100, 20, 0]);
    expect(floodFill(subject.context, 2, 1, 0, 0, { color: "#00ff00", opacity: 1, tolerance: 0 })).toBe(true);
    expect([...subject.pixels]).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
    expect(floodFill(subject.context, 2, 1, 0, 0, { color: "#00ff00", opacity: 1, tolerance: 0 })).toBe(false);
    expect(floodFill(subject.context, 2, 1, -1, 0, { color: "bad", opacity: 2, tolerance: 300 })).toBe(false);
  });
});
