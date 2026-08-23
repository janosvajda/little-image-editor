import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../models/imageDocument";
import { NewImageController } from "./newImageController";

describe("NewImageController", () => {
  it("drives every new-image control and creates the configured document", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const controller = new NewImageController(model);
    controller.open();
    expect(controller.dialog.open).toBe(true);

    const preset = document.querySelector<HTMLSelectElement>("#newImagePreset")!;
    expect([...preset.options].map(option => option.text)).toEqual(expect.arrayContaining([
      "3508 × 4961 — A3 at 300 DPI", "2480 × 3508 — A4 at 300 DPI", "1748 × 2480 — A5 at 300 DPI"
    ]));
    preset.value = "3508x4961";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector<HTMLInputElement>("#newImageWidth")!.value).toBe("3508");
    expect(document.querySelector<HTMLInputElement>("#newImageHeight")!.value).toBe("4961");
    expect(document.querySelector<HTMLInputElement>("#newImageResolution")!.value).toBe("300");

    const aspect = document.querySelector<HTMLSelectElement>("#newImageAspect")!;
    const width = document.querySelector<HTMLInputElement>("#newImageWidth")!;
    aspect.value = "1.6180339887";
    aspect.dispatchEvent(new Event("change", { bubbles: true }));
    width.value = "1000";
    width.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector<HTMLInputElement>("#newImageHeight")!.value).toBe("618");
    expect(preset.value).toBe("custom");

    const format = document.querySelector<HTMLSelectElement>("#newImageFormat")!;
    expect([...format.options].map(option => option.value)).toEqual(["image/png", "image/jpeg", "image/webp"]);
    format.value = "image/jpeg";
    format.dispatchEvent(new Event("change", { bubbles: true }));
    const transparent = document.querySelector<HTMLInputElement>("#newImageTransparent")!;
    transparent.click();
    expect(document.querySelector<HTMLInputElement>("#newImageColor")!.disabled).toBe(true);
    expect(document.querySelector("#transparencyWarning")!.classList).not.toContain("hidden");
    expect(document.querySelector("#transparencyWarning")!.textContent).toContain("JPEG does not support transparency");

    document.querySelector<HTMLInputElement>("#newImageName")!.value = "audit";
    document.querySelector<HTMLInputElement>("#newImageResolution")!.value = "144";
    document.querySelector<HTMLButtonElement>("#createImageButton")!.click();
    expect(model.hasImage).toBe(true);
    expect(model.baseName).toBe("audit");
    expect(model.savedType).toBe("image/jpeg");
    expect(model.resolution).toBe(144);
    expect(controller.dialog.open).toBe(false);
  });
});
