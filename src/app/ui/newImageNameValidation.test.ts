import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../models/imageDocument";
import { NewImageController } from "./newImageController";

describe("new image name validation", () => {
  it("rejects an empty name and clears the error after the user enters one", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const create = vi.spyOn(model, "create");
    const controller = new NewImageController(model);
    const name = document.querySelector<HTMLInputElement>("#newImageName")!;
    const error = document.querySelector<HTMLElement>("#newImageNameError")!;

    controller.open();
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("Untitled");
    document.querySelector<HTMLButtonElement>("#createImageButton")!.click();

    expect(create).not.toHaveBeenCalled();
    expect(controller.dialog.open).toBe(true);
    expect(name.getAttribute("aria-invalid")).toBe("");
    expect(error.classList).not.toContain("hidden");
    expect(error.textContent).toBe("File name is mandatory.");

    name.value = "real-name";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    expect(name.hasAttribute("aria-invalid")).toBe(false);
    expect(error.classList).toContain("hidden");

    document.querySelector<HTMLButtonElement>("#createImageButton")!.click();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "real-name" }));
    expect(controller.dialog.open).toBe(false);
  });
});
