import { describe, expect, it } from "vitest";
import { applyColorEffect, applySharpen } from "./imageFilterHelpers";

describe("image effects", () => {
  it("blends monochrome, sepia, and invert by the requested amount", () => {
    const source = () => new ImageData(new Uint8ClampedArray([100, 150, 200, 255]), 1, 1);
    const unchanged = source(); applyColorEffect(unchanged, "invert", 0);
    expect([...unchanged.data]).toEqual([100, 150, 200, 255]);
    const inverted = source(); applyColorEffect(inverted, "invert", .5);
    expect([...inverted.data]).toEqual([128, 128, 128, 255]);
    const monochrome = source(); applyColorEffect(monochrome, "monochrome");
    expect(monochrome.data[0]).toBe(monochrome.data[1]);
    expect(monochrome.data[1]).toBe(monochrome.data[2]);
    const sepia = source(); applyColorEffect(sepia, "sepia");
    expect(sepia.data[0]).toBeGreaterThan(sepia.data[2]!);
  });

  it("supports variable sharpening strength", () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4); pixels.fill(255); pixels[16] = pixels[17] = pixels[18] = 100;
    const unchanged = new ImageData(new Uint8ClampedArray(pixels), 3, 3); applySharpen(unchanged, 0);
    expect(unchanged.data[16]).toBe(100);
    const sharpened = new ImageData(pixels, 3, 3); applySharpen(sharpened, .5);
    expect(sharpened.data[16]).toBeLessThan(100);
  });
});
