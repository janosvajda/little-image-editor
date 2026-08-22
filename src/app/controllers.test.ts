import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "./canvas-document.js";
import { FileController } from "./file-controller.js";
import { NewImageController } from "./new-image-controller.js";
import { SpriteController } from "./sprite-controller.js";
import { WorkspaceUi } from "./workspace-ui.js";

describe("controllers", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("fallback.png");
  });

  it("saves as, then saves directly through a retained file handle", async () => {
    const model = new CanvasDocument();
    new NewImageController(model);
    const files = new FileController(model);
    model.create({ name: "test", width: 2, height: 2, transparent: false, background: "#fff" });
    const writable = { write: vi.fn(), close: vi.fn() };
    const handle = { name: "chosen.png", createWritable: vi.fn().mockResolvedValue(writable) } as unknown as FileSystemFileHandle;
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: vi.fn().mockResolvedValue(handle) });
    await files.saveAs();
    expect(model.fileHandle).toBe(handle);
    expect(model.baseName).toBe("chosen");
    await files.save();
    expect(writable.write).toHaveBeenCalledTimes(2);
  });

  it("handles save cancellation, fallback download, and rejected JPEG flattening", async () => {
    const model = new CanvasDocument(); new NewImageController(model); const files = new FileController(model);
    model.create({ name: "alpha", width: 2, height: 2, transparent: true, background: "#fff" });
    const format = document.querySelector<HTMLSelectElement>("#formatSelect")!;
    format.value = "image/jpeg";
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await files.saveAs();
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
    format.value = "image/png";
    await files.saveAs();
    vi.mocked(window.prompt).mockReturnValueOnce(null);
    await files.saveAs();
    files.open();
  });

  it("loads files through the file controller input", async () => {
    const model = new CanvasDocument(); new NewImageController(model); new FileController(model);
    const input = document.querySelector<HTMLInputElement>("#fileInput")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "open.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(model.hasImage).toBe(true));
  });

  it("handles empty and populated sprite queues", async () => {
    const model = new CanvasDocument(); const sprites = new SpriteController(model);
    document.querySelector<HTMLButtonElement>("#buildSpriteButton")!.click();
    const input = document.querySelector<HTMLInputElement>("#spriteInput")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "bad.txt", { type: "text/plain" }), new File(["x"], "ok.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(document.querySelector("#spriteCount")!.textContent).toBe("1"));
    document.querySelector<HTMLButtonElement>("#buildSpriteButton")!.click();
    expect(model.hasImage).toBe(true);
    expect(sprites.dialog.open).toBe(false);
  });

  it("restores stored panel layout and handles focus lifecycle", async () => {
    localStorage.setItem("little-editor.panel-layout.v2", JSON.stringify({ tools: { x: 5, y: 6, collapsed: true } }));
    const ui = new WorkspaceUi([document.querySelector<HTMLDialogElement>("#newImageDialog")!]);
    expect(document.querySelector('.panel[data-panel="tools"]')!.classList.contains("collapsed")).toBe(true);
    await ui.toggleFocus(true);
    expect(document.body.classList.contains("focus-mode")).toBe(true);
    await ui.toggleFocus(false);
    ui.openFileMenu();
    expect(document.querySelector<HTMLDetailsElement>("#fileMenu")!.open).toBe(true);
  });
});
