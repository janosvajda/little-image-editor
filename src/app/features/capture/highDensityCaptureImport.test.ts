import { describe, expect, it, vi } from "vitest";
import { highDensityCaptureDisplaySize } from "./browserCaptureHelpers";
import { CanvasDocument } from "../../core/document/imageDocument";
import { BrowserCaptureImporter } from "./browserCaptureImporter";

describe("HiDPI bug-report capture normalization", () => {
  it("maps a uniformly scaled device-pixel screenshot back to its CSS viewport", () => {
    expect(highDensityCaptureDisplaySize({ width: 1440, height: 697 }, 2880, 1394)).toEqual({ width: 1440, height: 697 });
    expect(highDensityCaptureDisplaySize({ width: 1280, height: 720 }, 1280, 720)).toBeNull();
    expect(highDensityCaptureDisplaySize({ width: 1000, height: 700 }, 2000, 1200)).toBeNull();
    expect(highDensityCaptureDisplaySize({ width: 0, height: 700 }, 2000, 1400)).toBeNull();
  });

  it("resets the imported document at CSS-pixel dimensions without affecting ordinary captures", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const resize = vi.spyOn(model, "resize");
    const source = { url: "https://example.test", capturedAt: "2026-08-23T12:00:00Z", userAgent: "Browser", viewport: { width: 10, height: 5 } };
    const importer = new BrowserCaptureImporter(model, { take: vi.fn().mockResolvedValue({ blob: new Blob(["png"], { type: "image/png" }), name: "bug.png", source }) });
    await importer.importFromLocation({ search: "?capture=hidpi" });
    expect(resize).toHaveBeenCalledWith(10, 5, "reset");
    expect(model.width).toBe(10); expect(model.height).toBe(5);

    resize.mockClear();
    const ordinary = new BrowserCaptureImporter(model, { take: vi.fn().mockResolvedValue({ blob: new Blob(["png"], { type: "image/png" }), name: "ordinary.png" }) });
    await ordinary.importFromLocation({ search: "?capture=ordinary" });
    expect(resize).not.toHaveBeenCalled();
  });
});
