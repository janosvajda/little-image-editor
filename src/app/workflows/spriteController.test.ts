import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../models/imageDocument";
import { SpriteController } from "./spriteController";

describe("SpriteController", () => {
  it("handles empty and populated frame queues", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!); const sprites = new SpriteController(model);
    const build = document.querySelector<HTMLButtonElement>("#buildSpriteButton")!;
    expect(build.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#spriteInput")!.accept).toBe("image/png,image/jpeg,image/webp");
    build.click();
    const input = document.querySelector<HTMLInputElement>("#spriteInput")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "bad.txt", { type: "text/plain" }), new File(["x"], "ok.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(document.querySelector("#spriteCount")!.textContent).toBe("1"));
    expect(build.disabled).toBe(false);
    build.click();
    expect(model.hasImage).toBe(true); expect(sprites.dialog.open).toBe(false);
    expect(document.querySelector("#spriteCount")!.textContent).toBe("0");
    expect(build.disabled).toBe(true);
    expect(input.value).toBe("");
  });
});
