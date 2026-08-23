import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../models/imageDocument";
import { ImageOperations } from "./imageOperationsController";

describe("ImageOperations", () => {
  it("resets controls and bakes a preview when another history operation occurs", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const operations = new ImageOperations(model);
    model.create({ name: "adjust", width: 2, height: 2, transparent: false, background: "#fff" });
    const brightness = document.querySelector<HTMLInputElement>("#brightnessInput")!;
    brightness.value = "30"; brightness.dispatchEvent(new Event("input", { bubbles: true }));
    expect(model.toolbarState("adjustments")).toBeDefined();
    model.commit();
    expect(brightness.value).toBe("0");
    brightness.value = "20"; brightness.dispatchEvent(new Event("input", { bubbles: true }));
    operations.resetControls();
    expect(document.querySelector("#brightnessValue")!.textContent).toBe("0");
  });

  it("restores persisted adjustment pixels into an ImageData base", () => {
    const source = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    new ImageOperations(source); source.create({ name: "source", width: 2, height: 2, transparent: false, background: "#fff" });
    const brightness = document.querySelector<HTMLInputElement>("#brightnessInput")!;
    brightness.value = "15"; brightness.dispatchEvent(new Event("input", { bubbles: true }));
    const session = source.snapshotSession();
    const canvas = document.createElement("canvas"), overlay = document.createElement("canvas");
    const restored = new CanvasDocument(canvas, overlay); new ImageOperations(restored);
    expect(() => restored.restoreSession(session)).not.toThrow();
    expect(vi.mocked(restored.context.putImageData)).toHaveBeenCalled();
  });
});
