import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { NewImageController } from "./newImageController";

describe("new image default name", () => {
  it("creates an unnamed document with the untitled save-name fallback", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const create = vi.spyOn(model, "create");
    const controller = new NewImageController(model);
    const name = document.querySelector<HTMLInputElement>("#newImageName")!;
    controller.open();
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("Untitled");
    document.querySelector<HTMLButtonElement>("#createImageButton")!.click();

		expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "untitled" }));
    expect(controller.dialog.open).toBe(false);
  });
});
