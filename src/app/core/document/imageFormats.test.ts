import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_FORMAT, IMAGE_FORMATS, imageFormat } from "./imageFormats";

describe("imageFormats", () => {
  it("defines PNG, JPEG, and WebP capabilities in one registry", () => {
    expect(IMAGE_FORMATS.map(format => format.mimeType)).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(imageFormat("image/png").supportsTransparency).toBe(true);
    expect(imageFormat("image/jpeg").supportsTransparency).toBe(false);
    expect(imageFormat("image/webp").supportsTransparency).toBe(true);
  });

  it("falls back safely for an unknown browser format", () => {
    expect(imageFormat("image/unknown")).toBe(DEFAULT_IMAGE_FORMAT);
  });
});
