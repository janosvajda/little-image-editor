import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewImageController } from "./newImageController";
import { CanvasDocument } from "../../core/document/imageDocument";
import { FileController } from "./fileController";
import { AnnotationDocument } from "../annotations/annotationDocument";
import { SvgDocumentController } from "./svgDocumentController";

describe("FileController", () => {
  beforeEach(() => { vi.spyOn(window, "confirm").mockReturnValue(true); vi.spyOn(window, "prompt").mockReturnValue("fallback.png"); vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA"); });

  function subject() {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!); new NewImageController(model); const files = new FileController(model); files.setSvgDocument(new SvgDocumentController(model, new AnnotationDocument())); return { model, files };
  }

  it("saves as, then saves directly through a retained handle", async () => {
    const { model, files } = subject();
    model.create({ name: "test", width: 2, height: 2, transparent: false, background: "#fff" });
    const writable = { write: vi.fn(), close: vi.fn() };
    const handle = { name: "chosen.svg", createWritable: vi.fn().mockResolvedValue(writable) } as unknown as FileSystemFileHandle;
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: vi.fn().mockResolvedValue(handle) });
    await files.saveAs(); await files.save();
    expect(model.fileHandle).toBe(handle); expect(model.baseName).toBe("chosen"); expect(writable.write).toHaveBeenCalledTimes(2);
  });

  it("rejects an extensionless handle and reopens with a corrected filename", async () => {
    const { model, files } = subject();
    model.create({ name: "picture", width: 2, height: 2, transparent: false, background: "#fff" });
    const writable = { write: vi.fn(), close: vi.fn() };
    const invalid = { name: "picture", createWritable: vi.fn() } as unknown as FileSystemFileHandle;
    const valid = { name: "picture.svg", createWritable: vi.fn().mockResolvedValue(writable) } as unknown as FileSystemFileHandle;
    const picker = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: picker });
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    await files.saveAs();
    expect(picker).toHaveBeenNthCalledWith(2, expect.objectContaining({ suggestedName: "picture.svg" }));
    expect(invalid.createWritable).not.toHaveBeenCalled();
    expect(valid.createWritable).toHaveBeenCalledOnce();
  });

  it("exports in the selected format without changing the active document file", async () => {
    const { model, files } = subject();
    model.create({ name: "picture", width: 2, height: 2, transparent: false, background: "#fff" });
    const writable = { write: vi.fn(), close: vi.fn() };
    const handle = { name: "export.webp", createWritable: vi.fn().mockResolvedValue(writable) } as unknown as FileSystemFileHandle;
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: vi.fn().mockResolvedValue(handle) });
    await files.exportImage("image/webp");
    expect(model.fileHandle).toBeNull();
    expect(model.savedType).toBe("image/png");
    expect(writable.write).toHaveBeenCalledOnce();
  });

});
