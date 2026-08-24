import { describe, expect, it } from "vitest";

describe("close image presentation contract", () => {
  it("places Close immediately after Save and gives the confirmation compact action hooks", async () => {
    await import("../../../editor");
    const save = document.querySelector("#quickSaveButton")!;
    const close = document.querySelector("#quickCloseImageButton")!;
    expect(save.nextElementSibling).toBe(close);
    expect(close.getAttribute("aria-label")).toBe("Discard current image");

    const dialog = document.querySelector<HTMLDialogElement>("#closeImageDialog")!;
    expect(dialog.getAttribute("aria-labelledby")).toBe("closeImageDialogTitle");
    expect(dialog.querySelector("form")!.classList).toContain("confirmation-dialog");
    expect(dialog.querySelectorAll("footer .dialog-action svg")).toHaveLength(2);
  });
});
