import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../models/imageDocument";
import { EffectsController } from "./effectsController";

describe("EffectsController", () => {
  it("supports dropdown configuration, reversible preview, apply, and clear", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    new EffectsController(model);
    model.create({ name: "effects", width: 3, height: 3, transparent: false, background: "#fff" });
    const pixels = new Uint8ClampedArray(3 * 3 * 4); pixels.fill(120);
    vi.mocked(model.context.getImageData).mockReturnValue(new ImageData(pixels, 3, 3));
    vi.mocked(model.context.getImageData).mockClear();
    vi.mocked(model.context.putImageData).mockClear();
    const effect = document.querySelector<HTMLSelectElement>("#effectSelect")!;
    const amount = document.querySelector<HTMLInputElement>("#effectAmountInput")!;

    effect.value = "sharpen"; effect.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    expect(amount.max).toBe("200");
    expect(document.querySelector("#effectAmountName")!.textContent).toBe("Strength");
    expect(model.toolbarState("effects")).toMatchObject({ controls: { effectSelect: "sharpen" } });
    expect(vi.mocked(model.context.getImageData)).not.toHaveBeenCalled();
    expect(vi.mocked(model.context.putImageData)).not.toHaveBeenCalled();
    expect(effect.size).toBe(1);

    const preview = document.querySelector<HTMLButtonElement>("#previewEffectButton")!;
    const clear = document.querySelector<HTMLButtonElement>("#clearEffectButton")!;
    preview.click();
    expect(preview.textContent).toBe("Cancel preview");
    expect(clear.disabled).toBe(true);
    expect(vi.mocked(model.context.getImageData)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(model.context.putImageData)).toHaveBeenCalledTimes(1);
    amount.value = "75"; amount.dispatchEvent(new Event("input", { bubbles: true }));
    expect(vi.mocked(model.context.putImageData)).toHaveBeenCalledTimes(2);
    preview.click();
    expect(preview.textContent).toBe("Preview");
    expect(vi.mocked(model.context.putImageData)).toHaveBeenCalledTimes(3);

    effect.value = "sepia"; effect.dispatchEvent(new Event("change", { bubbles: true }));
    amount.value = "35"; amount.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    vi.mocked(model.context.getImageData).mockClear(); vi.mocked(model.context.putImageData).mockClear();
    document.querySelector<HTMLButtonElement>("#applyEffectButton")!.click();
    expect(vi.mocked(model.context.getImageData)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(model.context.putImageData)).toHaveBeenCalledTimes(1);
    expect(clear.disabled).toBe(false);
    clear.click();
    expect(clear.disabled).toBe(true);
    expect(vi.mocked(model.context.putImageData)).toHaveBeenCalledTimes(2);
    expect(document.querySelector("#effectAmountValue")!.textContent).toBe("35%");
    expect(model.toolbarState("effects")).toMatchObject({ controls: { effectSelect: "sepia", effectAmountInput: "35" } });
  });
});
