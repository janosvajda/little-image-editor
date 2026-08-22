import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "./imageDocument.js";

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

  it("loads image files and ignores non-images", async () => {
    await subject.load(new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(subject.hasImage).toBe(false);
    await subject.load(new File(["x"], "photo.png", { type: "image/png" }));
    expect(subject.hasImage).toBe(true);
    expect(subject.baseName).toBe("photo");
    expect([subject.width, subject.height]).toEqual([20, 10]);
  });

  it("safely ignores invalid history, crop, and resize requests", () => {
    subject.undo(); subject.redo(); subject.crop({ x: 0, y: 0, width: 0, height: 0 }); subject.resize(0, 0); subject.transform(90);
    expect(subject.hasImage).toBe(false);
  });
});
