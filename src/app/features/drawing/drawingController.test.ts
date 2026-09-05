import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import type { CanvasViewportController } from "../workspace/canvasViewportController";
import { DrawingController } from "./drawingController";

function setupController(): { model: CanvasDocument; controller: DrawingController } {
  const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
  return { model, controller: new DrawingController(model) };
}

function resetMarkup(): void {
  const html = readFileSync(resolve("src/editor.html"), "utf8").replace(/<script[\s\S]*?<\/script>/, "");
  document.open(); document.write(html); document.close();
}

describe("DrawingController preferences", () => {
  it("restores the active tool and all drawing controls without replacing the chosen color", () => {
    const source = setupController();
    source.controller.setInitialColor("light");
    source.model.create({ name: "first", width: 4, height: 4, transparent: true, background: "#fff" });
    source.controller.select("highlighter");
    const change = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    change("#colorInput", "#123456");
    change("#sizeInput", "47");
    change("#opacityInput", "64");
    change("#hardnessInput", "72");
    const fill = document.querySelector<HTMLInputElement>("#fillInput")!;
    fill.checked = true; fill.dispatchEvent(new Event("change", { bubbles: true }));

    const session = source.model.snapshotSession();
    resetMarkup();
    const restored = setupController();
    restored.controller.setInitialColor("light");
    restored.model.restoreSession(session);
    expect(document.querySelector<HTMLSelectElement>("#paintToolSelect")!.value).toBe("highlighter");
    expect(document.querySelector("#paintToolControl")!.classList).toContain("active");
    expect(document.querySelector<HTMLInputElement>("#colorInput")!.value).toBe("#123456");
    expect(document.querySelector<HTMLInputElement>("#sizeInput")!.value).toBe("47");
    expect(document.querySelector<HTMLInputElement>("#opacityInput")!.value).toBe("64");
    expect(document.querySelector<HTMLInputElement>("#hardnessInput")!.value).toBe("72");
    expect(document.querySelector<HTMLInputElement>("#fillInput")!.checked).toBe(true);
  });

  it("resets tool state for a newly created image", () => {
    const subject = setupController();
    subject.controller.setInitialColor("light");
    subject.model.create({ name: "first", width: 4, height: 4, transparent: true, background: "#fff" });
    subject.controller.select("marker");
    const color = document.querySelector<HTMLInputElement>("#colorInput")!;
    color.value = "#123456"; color.dispatchEvent(new Event("input", { bubbles: true }));
    subject.model.create({ name: "second", width: 4, height: 4, transparent: true, background: "#fff" });
    expect(document.querySelector<HTMLSelectElement>("#paintToolSelect")!.value).toBe("brush");
    expect(color.value).toBe("#000000");
  });

  it("uses the shared viewport when the zoom tool clicks the canvas", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const zoomAt = vi.fn();
    const controller = new DrawingController(model, { zoomAt } as unknown as CanvasViewportController);
    model.create({ name: "zoomable", width: 100, height: 50, transparent: true, background: "#fff" });
    controller.select("zoom");
    model.overlay.dispatchEvent(new MouseEvent("pointerdown", { clientX: 30, clientY: 20, bubbles: true }) as unknown as PointerEvent);
    model.overlay.dispatchEvent(new MouseEvent("pointerdown", { clientX: 40, clientY: 25, altKey: true, bubbles: true }) as unknown as PointerEvent);

    expect(zoomAt).toHaveBeenNthCalledWith(1, 30, 20, 1);
    expect(zoomAt).toHaveBeenNthCalledWith(2, 40, 25, -1);
    expect(document.querySelector('[data-tool="zoom"]')).not.toBeNull();
    expect(model.overlay.style.cursor).toBe("zoom-out");
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
    expect(model.overlay.style.cursor).toBe("zoom-in");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true }));
    expect(model.overlay.style.cursor).toBe("zoom-out");
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
    expect(model.overlay.style.cursor).toBe("zoom-in");
    expect(document.querySelector(".zoom-tool-hint")!.classList).not.toContain("hidden");
    expect(document.querySelector(".zoom-tool-options")!.classList).not.toContain("hidden");
    expect(document.querySelector("#colorInput")!.closest("label")!.classList).toContain("hidden");
  });

  it("keeps sampled, paint, and fill colours independent until explicitly copied", () => {
    const { model, controller } = setupController();
    expect(document.querySelector('[data-tool="eraser"] .eraser-icon path')).not.toBeNull();
    const pickerIcon = document.querySelector('[data-tool="picker"] svg');
    expect(pickerIcon).not.toBeNull();
    expect(pickerIcon!.querySelector("path")).not.toBeNull();
    expect(pickerIcon!.querySelector("circle")).toBeNull();
    model.create({ name: "sample", width: 2, height: 2, transparent: true, background: "#fff" });
    vi.mocked(model.context.getImageData).mockReturnValueOnce(new ImageData(new Uint8ClampedArray([18, 52, 86, 255]), 1, 1));
    controller.select("picker");
    model.overlay.dispatchEvent(new MouseEvent("pointerdown", { clientX: 0, clientY: 0, bubbles: true }) as unknown as PointerEvent);

    expect(document.querySelector(".picker-tool-options")!.classList).not.toContain("hidden");
    expect(document.querySelector(".fill-tool-options")!.classList).toContain("hidden");
    expect(document.querySelector(".sampled-color code")!.textContent).toBe("#123456");
    expect(document.querySelector<HTMLInputElement>("#colorInput")!.value).not.toBe("#123456");
    expect(document.querySelector<HTMLInputElement>("#fillColorInput")!.value).not.toBe("#123456");
    expect(document.querySelector("#colorInput")!.closest("label")!.classList).toContain("hidden");
    const paintColor = document.querySelector<HTMLInputElement>("#colorInput")!;
    paintColor.value = "#abcdef";
    paintColor.dispatchEvent(new Event("input", { bubbles: true }));
    controller.select("brush");
    controller.select("picker");
    expect(document.querySelector(".sampled-color code")!.textContent).toBe("#123456");
    document.querySelector<HTMLButtonElement>("[data-use-color=fill]")!.click();
    expect(document.querySelector<HTMLInputElement>("#fillColorInput")!.value).toBe("#123456");
    document.querySelector<HTMLButtonElement>("[data-use-color=paint]")!.click();
    expect(document.querySelector<HTMLInputElement>("#colorInput")!.value).toBe("#123456");

    controller.select("fill");
    expect(document.querySelector(".picker-tool-options")!.classList).toContain("hidden");
    expect(document.querySelector(".fill-tool-options")!.classList).not.toContain("hidden");
    expect(document.querySelector("#opacityInput")!.closest("label")!.classList).not.toContain("hidden");
  });

  it("maps shapes, picker pixels, and cut selections to image coordinates at 200% zoom", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const controller = new DrawingController(model);
    model.create({ name: "scaled", width: 200, height: 100, transparent: true, background: "#fff" });
    Object.defineProperty(model.overlay, "getBoundingClientRect", { configurable: true, value: () => ({ left: 10, top: 20, width: 400, height: 200, right: 410, bottom: 220, x: 10, y: 20, toJSON: () => ({}) }) });
    const pointer = (type: string, x: number, y: number) => model.overlay.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as unknown as PointerEvent);

    controller.select("line");
    pointer("pointerdown", 110, 70); pointer("pointerup", 310, 170);
    expect(vi.mocked(model.context.moveTo)).toHaveBeenCalledWith(50, 25);
    expect(vi.mocked(model.context.lineTo)).toHaveBeenCalledWith(150, 75);

    controller.select("picker");
    pointer("pointerdown", 410, 220);
    expect(vi.mocked(model.context.getImageData)).toHaveBeenCalledWith(199, 99, 1, 1);

    controller.select("crop");
    pointer("pointerdown", 110, 70); pointer("pointerup", 310, 170);
    expect([model.width, model.height]).toEqual([200, 100]);
		expect(document.querySelector("#applyCropButton")).toBeNull();
  });

  it("fills a zoomed contiguous region and records undo and persistent tolerance", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const controller = new DrawingController(model);
    model.create({ name: "fillable", width: 4, height: 2, transparent: true, background: "#fff" });
    Object.defineProperty(model.overlay, "getBoundingClientRect", { configurable: true, value: () => ({ left: 10, top: 20, width: 8, height: 4, right: 18, bottom: 24, x: 10, y: 20, toJSON: () => ({}) }) });
    const drawingColor = document.querySelector<HTMLInputElement>("#colorInput")!;
    drawingColor.value = "#123456"; drawingColor.dispatchEvent(new Event("input", { bubbles: true }));
    const fillColor = document.querySelector<HTMLInputElement>("#fillColorInput")!;
    fillColor.value = "#ff0000"; fillColor.dispatchEvent(new Event("input", { bubbles: true }));
    const tolerance = document.querySelector<HTMLInputElement>("#fillToleranceInput")!;
    tolerance.value = "12"; tolerance.dispatchEvent(new Event("input", { bubbles: true }));
    controller.select("fill");
    expect(model.overlay.classList).toContain("fill-cursor");
    model.overlay.dispatchEvent(new MouseEvent("pointerdown", { clientX: 14, clientY: 22, bubbles: true }) as unknown as PointerEvent);
    await Promise.resolve();

    expect([...model.context.getImageData(0, 0, 1, 1).data]).toEqual([255, 0, 0, 255]);
    expect(model.toolbarState("drawing")).toMatchObject({ controls: { colorInput: "#123456", fillColorInput: "#ff0000", fillToleranceInput: "12" }, activeTool: "fill" });
    controller.select("brush");
    expect(drawingColor.value).toBe("#123456");
    model.undo();
    expect(model.context.getImageData(0, 0, 1, 1).data[3]).toBe(0);
  });
});
