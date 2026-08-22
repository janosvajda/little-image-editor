import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../models/imageDocument.js";
import { SpriteController } from "./spriteController.js";

describe("SpriteController", () => {
  it("handles empty and populated frame queues", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!); const sprites = new SpriteController(model);
    document.querySelector<HTMLButtonElement>("#buildSpriteButton")!.click();
    const input = document.querySelector<HTMLInputElement>("#spriteInput")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "bad.txt", { type: "text/plain" }), new File(["x"], "ok.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(document.querySelector("#spriteCount")!.textContent).toBe("1"));
    document.querySelector<HTMLButtonElement>("#buildSpriteButton")!.click();
    expect(model.hasImage).toBe(true); expect(sprites.dialog.open).toBe(false);
  });
});
