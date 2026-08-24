import { describe, expect, it } from "vitest";
import { ensureImageExtension, hasValidExtension, preferredExtension } from "./fileNameHelpers";

describe("fileNameHelpers", () => {
  it("returns preferred extensions", () => {
    expect(preferredExtension("image/png")).toBe("png");
    expect(preferredExtension("image/jpeg")).toBe("jpg");
    expect(preferredExtension("image/webp")).toBe("webp");
  });

  it("accepts case-insensitive JPEG aliases", () => {
    expect(hasValidExtension("photo.JPG", "image/jpeg")).toBe(true);
    expect(hasValidExtension("photo.jpeg", "image/jpeg")).toBe(true);
    expect(hasValidExtension("photo", "image/png")).toBe(false);
  });

  it("appends missing extensions and replaces mismatched ones", () => {
    expect(ensureImageExtension("photo", "image/png")).toBe("photo.png");
    expect(ensureImageExtension("photo.jpg", "image/webp")).toBe("photo.webp");
    expect(ensureImageExtension("  ", "image/jpeg")).toBe("little-image.jpg");
  });
});
