import { indexedDB as fakeIndexedDb } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureFileName, scaledCaptureRect } from "./browserCaptureHelpers";
import { CanvasDocument } from "../../core/document/imageDocument";
import { BrowserCaptureImporter } from "./browserCaptureImporter";
import { BrowserCaptureStore } from "./browserCaptureStore";
import { ClipboardController } from "../files/clipboardController";

describe("browser-integrated image workflows", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb });
  });

  it("maps CSS-pixel capture bounds to screenshot pixels and clamps them", () => {
    expect(scaledCaptureRect(
      { x: 100, y: 50, width: 400, height: 200 },
      { width: 1000, height: 500 },
      2000,
      1000
    )).toEqual({ x: 200, y: 100, width: 800, height: 400 });
    expect(scaledCaptureRect(
      { x: -10, y: 90, width: 130, height: 30 },
      { width: 100, height: 100 },
      200,
      200
    )).toEqual({ x: 0, y: 180, width: 200, height: 20 });
    expect(scaledCaptureRect({ x: 0, y: 0, width: 1, height: 1 }, { width: 0, height: 10 }, 10, 10)).toBeNull();
    expect(scaledCaptureRect({ x: 20, y: 20, width: 0, height: 0 }, { width: 100, height: 100 }, 100, 100)).toBeNull();
    expect(captureFileName("region", new Date("2026-08-23T12:34:56.789Z"))).toBe("region-capture-2026-08-23T12-34-56-789Z.png");
  });

  it("stores each pending capture until it is consumed once", async () => {
    const store = new BrowserCaptureStore();
    const id = crypto.randomUUID();
    const capture = { blob: new Blob(["png"], { type: "image/png" }), name: "page.png" };
    await store.put(id, capture);
    expect((await store.take(id))?.name).toBe("page.png");
    expect(await store.take(id)).toBeNull();
  });

  it("imports and crops a pending browser capture as a new document", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const crop = vi.spyOn(model, "crop");
    const take = vi.fn().mockResolvedValue({
      blob: new Blob(["png"], { type: "image/png" }), name: "image-capture.png",
      crop: { x: 25, y: 20, width: 50, height: 40 }, viewport: { width: 100, height: 100 }
    });
    const importer = new BrowserCaptureImporter(model, { take });

    expect(await importer.importFromLocation({ search: "?capture=capture-1" })).toBe(true);
    expect(take).toHaveBeenCalledWith("capture-1");
    expect(model.hasImage).toBe(true);
    expect(model.baseName).toBe("image-capture");
    expect(crop).toHaveBeenCalledWith({ x: 5, y: 2, width: 10, height: 4 });
  });

  it("ignores locations and capture identifiers that have no pending image", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const take = vi.fn().mockResolvedValue(null);
    const importer = new BrowserCaptureImporter(model, { take });
    expect(await importer.importFromLocation({ search: "" })).toBe(false);
    expect(take).not.toHaveBeenCalled();
    expect(await importer.importFromLocation({ search: "?capture=missing" })).toBe(false);
    expect(take).toHaveBeenCalledWith("missing");
    expect(model.hasImage).toBe(false);
  });

  it("copies only an open image as PNG and reports success or failure", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: class { constructor(readonly items: Record<string, Blob>) {} } });
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const controller = new ClipboardController(model);
    expect(await controller.copy()).toBe(false);
    expect(write).not.toHaveBeenCalled();

    model.create({ width: 10, height: 10, name: "copy", background: "#fff", transparent: false });
    expect(await controller.copy()).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(document.querySelector("#clipboardStatus")!.textContent).toBe("Image copied to clipboard.");

    write.mockRejectedValueOnce(new Error("denied"));
    expect(await controller.copy()).toBe(false);
    expect(document.querySelector("#clipboardStatus")!.textContent).toContain("Could not copy");
  });
});
