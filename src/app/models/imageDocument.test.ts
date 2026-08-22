import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "./imageDocument";

describe("CanvasDocument", () => {
  let subject: CanvasDocument;

  beforeEach(() => { subject = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!); });

  it("creates, commits, undoes, redoes, crops, resizes, and transforms a document", () => {
    const history = vi.fn();
    const documents = vi.fn();
    subject.onHistoryChange(history);
    subject.onDocumentChange(documents);
    subject.create({ name: "picture", width: 100, height: 50, transparent: false, background: "#ffffff" });
    expect(subject.hasImage).toBe(true);
    expect(subject.baseName).toBe("picture");
    expect([subject.width, subject.height]).toEqual([100, 50]);
    expect(documents).toHaveBeenLastCalledWith({ hasImage: true, width: 100, height: 50 });

    subject.context.fillRect(0, 0, 5, 5);
    subject.commit();
    subject.undo();
    expect(history).toHaveBeenLastCalledWith(false, true);
    subject.redo();
    expect(history).toHaveBeenLastCalledWith(true, false);
    subject.crop({ x: 0, y: 0, width: 20, height: 10 });
    expect([subject.width, subject.height]).toEqual([20, 10]);
    subject.resize(40, 30);
    expect([subject.width, subject.height]).toEqual([40, 30]);
    subject.transform(90);
    expect([subject.width, subject.height]).toEqual([30, 40]);
    subject.transform(0, -1, 1);
  });

  it("creates transparent canvases and encodes all supported formats", async () => {
    subject.create({ name: "alpha", width: 4, height: 4, transparent: true, background: "#fff" });
    expect(subject.containsTransparency()).toBe(true);
    await expect(subject.toBlob("image/png")).resolves.toHaveProperty("type", "image/png");
    await expect(subject.toBlob("image/jpeg")).resolves.toHaveProperty("type", "image/jpeg");
    await expect(subject.toBlob("image/webp")).resolves.toHaveProperty("type", "image/webp");
  });

  it("stores toolbar state inside the document session and clears it for a new image", () => {
    subject.create({ name: "stateful", width: 4, height: 4, transparent: true, background: "#fff" });
    subject.setToolbarState("adjustments", { brightness: 25 });
    expect(subject.toolbarState("adjustments")).toEqual({ brightness: 25 });
    const session = subject.snapshotSession();
    subject.create({ name: "new", width: 2, height: 2, transparent: true, background: "#fff" });
    expect(subject.toolbarState("adjustments")).toBeUndefined();
    subject.restoreSession(session);
    expect(subject.toolbarState("adjustments")).toEqual({ brightness: 25 });
  });

  it("restores live pixels and toolbar values from the same session moment", () => {
    subject.create({ name: "adjusted", width: 2, height: 2, transparent: false, background: "#ffffff" });
    const session = subject.snapshotSession();
    session.pixels.fill(31);
    session.toolbarStates = { adjustments: { controls: { brightnessInput: "-69" } } };

    subject.restoreSession(session);

    expect(subject.context.getImageData(0, 0, 2, 2).data[0]).toBe(31);
    expect(subject.toolbarState("adjustments")).toEqual({ controls: { brightnessInput: "-69" } });
    expect(subject.snapshotSession().history[0]?.pixels[0]).toBe(31);
  });

  it("loads image files and ignores non-images", async () => {
    await subject.load(new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(subject.hasImage).toBe(false);
    await subject.load(new File(["x"], "photo.png", { type: "image/png" }));
    expect(subject.hasImage).toBe(true);
    expect(subject.baseName).toBe("photo");
    expect([subject.width, subject.height]).toEqual([20, 10]);
  });

  it("clears history when a document is created, opened, or closed", async () => {
    const history = vi.fn();
    subject.onHistoryChange(history);

    subject.create({ name: "first", width: 4, height: 4, transparent: true, background: "#fff" });
    subject.commit();
    expect(history).toHaveBeenLastCalledWith(true, false);

    subject.create({ name: "second", width: 8, height: 8, transparent: true, background: "#fff" });
    expect(history).toHaveBeenLastCalledWith(false, false);
    subject.commit();

    await subject.load(new File(["x"], "opened.png", { type: "image/png" }));
    expect(history).toHaveBeenLastCalledWith(false, false);
    subject.commit();

    subject.close();
    expect(subject.hasImage).toBe(false);
    expect(history).toHaveBeenLastCalledWith(false, false);
  });

  it("safely ignores invalid history, crop, and resize requests", () => {
    subject.undo(); subject.redo(); subject.crop({ x: 0, y: 0, width: 0, height: 0 }); subject.resize(0, 0); subject.transform(90);
    expect(subject.hasImage).toBe(false);
  });
});
