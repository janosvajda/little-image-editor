import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { NewImageController } from "./newImageController";

describe("new image resolution presets", () => {
  it("offers practical PPI values and selects print resolution for print presets", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    new NewImageController(model);
    const resolution = document.querySelector<HTMLSelectElement>("#newImageResolution")!;

    expect(resolution.tagName).toBe("SELECT");
    expect([...resolution.options].map(option => option.value)).toEqual([
      "72", "96", "144", "150", "240", "300", "600", "1200"
    ]);
    expect(resolution.value).toBe("96");

    const preset = document.querySelector<HTMLSelectElement>("#newImagePreset")!;
    preset.value = "2480x3508";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
    expect(resolution.value).toBe("300");
  });
});
