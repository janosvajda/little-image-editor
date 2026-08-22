import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewImageController } from "../ui/newImageController.js";
import { CanvasDocument } from "../models/imageDocument.js";
import { FileController } from "./fileController.js";

describe("FileController", () => {
  beforeEach(() => { vi.spyOn(window, "confirm").mockReturnValue(true); vi.spyOn(window, "prompt").mockReturnValue("fallback.png"); });

  function subject() {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!); new NewImageController(model); return { model, files: new FileController(model) };
  }

  it("saves as, then saves directly through a retained handle", async () => {
    const { model, files } = subject();
    model.create({ name: "test", width: 2, height: 2, transparent: false, background: "#fff" });
    const writable = { write: vi.fn(), close: vi.fn() };
    const handle = { name: "chosen.png", createWritable: vi.fn().mockResolvedValue(writable) } as unknown as FileSystemFileHandle;
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: vi.fn().mockResolvedValue(handle) });
    await files.saveAs(); await files.save();
    expect(model.fileHandle).toBe(handle); expect(model.baseName).toBe("chosen"); expect(writable.write).toHaveBeenCalledTimes(2);
  });

  it("handles save cancellation and fallback download", async () => {
    const { model, files } = subject();
    model.create({ name: "alpha", width: 2, height: 2, transparent: true, background: "#fff" });
    const format = document.querySelector<HTMLSelectElement>("#formatSelect")!; format.value = "image/jpeg";
    vi.mocked(window.confirm).mockReturnValueOnce(false); await files.saveAs();
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
    format.value = "image/png"; await files.saveAs();
    vi.mocked(window.prompt).mockReturnValueOnce(null); await files.saveAs(); files.open();
  });

  it("loads selected files", async () => {
    const { model } = subject();
    const input = document.querySelector<HTMLInputElement>("#fileInput")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "open.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change")); await vi.waitFor(() => expect(model.hasImage).toBe(true));
  });
});
