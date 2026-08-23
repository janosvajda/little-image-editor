import { describe, expect, it } from "vitest";
import { populateImageFormatSelect, transparencyWarning } from "./formatSelectHelpers";

describe("formatSelectHelpers", () => {
  it("populates supported formats, normalizes selection, and explains transparency", () => {
    const select = document.createElement("select");
    populateImageFormatSelect(select, "image/webp");
    expect([...select.options].map(option => option.text)).toEqual(["PNG", "JPEG", "WebP"]);
    expect(select.value).toBe("image/webp");
    expect(transparencyWarning("image/png")).toContain("preserves transparent pixels");
    expect(transparencyWarning("image/jpeg")).toContain("replaced with white");
  });
});
