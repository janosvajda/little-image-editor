import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { FileController } from "./fileController";

describe("save and close image actions", () => {
  it("uses recognizable icons and requires confirmation before closing", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const files = new FileController(model);
    const saveIcon = document.querySelector<SVGElement>("#quickSaveButton svg")!;
    const quickClose = document.querySelector<HTMLButtonElement>("#quickCloseImageButton")!;

    expect(saveIcon.classList).toContain("filled-icon");
    expect(saveIcon.querySelector("path")!.getAttribute("fill-rule")).toBe("evenodd");
    expect(quickClose.querySelector("svg path")).not.toBeNull();
    expect(document.querySelector("#closeImageButton svg")).not.toBeNull();
    expect(quickClose.disabled).toBe(true);

    model.create({ width: 20, height: 10, name: "unsaved", background: "#fff", transparent: false });
    expect(quickClose.disabled).toBe(false);
    quickClose.click();
    expect(files.closeDialog.open).toBe(true);
    expect(model.hasImage).toBe(true);

    files.closeDialog.querySelector<HTMLButtonElement>('footer [value="cancel"]')!.click();
    expect(files.closeDialog.open).toBe(false);
    expect(model.hasImage).toBe(true);

    document.querySelector<HTMLButtonElement>("#closeImageButton")!.click();
    expect(files.closeDialog.open).toBe(true);
    document.querySelector<HTMLButtonElement>("#confirmCloseImageButton")!.click();
    expect(files.closeDialog.open).toBe(false);
    expect(model.hasImage).toBe(false);
    expect(quickClose.disabled).toBe(true);
  });

  it("does not open the close confirmation without an image and treats the title X as cancellation", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const files = new FileController(model);
    files.requestClose();
    expect(files.closeDialog.open).toBe(false);

    model.create({ width: 5, height: 5, name: "keep", background: "#fff", transparent: false });
    files.requestClose();
    files.closeDialog.querySelector<HTMLButtonElement>('header [value="cancel"]')!.click();
    expect(files.closeDialog.open).toBe(false);
    expect(model.hasImage).toBe(true);
  });
});
