import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { CanvasViewportController } from "./canvasViewportController";

describe("CanvasViewportController", () => {
  it("keeps zoom and ruler measurements synchronized and document-persistent", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const viewport = new CanvasViewportController(model);
    model.create({ name: "measured", width: 200, height: 100, transparent: true, background: "#fff" });
    const zoom = document.querySelector<HTMLSelectElement>("#zoomSelect")!;
    const unit = document.querySelector<HTMLSelectElement>("#rulerUnitSelect")!;
    zoom.value = "200"; zoom.dispatchEvent(new Event("change", { bubbles: true }));
    unit.value = "cm"; unit.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();

    expect(viewport.zoom).toBe(2);
    expect(viewport.unit).toBe("cm");
    expect(document.querySelector<HTMLElement>(".canvas-stage")!.style.width).toBe("400px");
    expect(document.querySelector(".horizontal-ruler")!.children.length).toBeGreaterThan(1);
    expect(document.querySelector("#zoomLabel")!.textContent).toBe("200%");
    expect(model.toolbarState("viewport")).toMatchObject({ controls: { zoomSelect: "200", rulerUnitSelect: "cm", rulerVisibleInput: true } });
  });

  it("supports zoom shortcuts, ruler toggling, and resets for a new image", async () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const viewport = new CanvasViewportController(model);
    model.create({ name: "first", width: 20, height: 10, transparent: true, background: "#fff" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "+", ctrlKey: true, bubbles: true }));
    expect(viewport.zoom).toBe(1.25);
    document.querySelector<HTMLButtonElement>("#rulerToggleButton")!.click();
    expect(viewport.rulersVisible).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true, bubbles: true }));
    expect(viewport.zoom).toBe(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "-", ctrlKey: true, bubbles: true }));
    expect(viewport.zoom).toBe(.75);

    model.create({ name: "second", width: 30, height: 15, transparent: true, background: "#fff" });
    await Promise.resolve();
    expect(viewport.zoom).toBe(1);
    expect(viewport.rulersVisible).toBe(true);
  });

  it("fits to the window and exposes Photoshop-style zoom commands", () => {
    const wrap = document.querySelector<HTMLElement>("#canvasWrap")!;
    Object.defineProperty(wrap, "clientWidth", { configurable: true, value: 500 });
    Object.defineProperty(wrap, "clientHeight", { configurable: true, value: 400 });
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const viewport = new CanvasViewportController(model);
    model.create({ name: "large", width: 1000, height: 500, transparent: true, background: "#fff" });
    viewport.fitToWindow(); expect(viewport.zoom).toBe(.25);
    viewport.zoomIn(); expect(viewport.zoom).toBe(.5);
    viewport.zoomOut(); expect(viewport.zoom).toBe(.25);
    viewport.actualPixels(); expect(viewport.zoom).toBe(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "0", ctrlKey: true, bubbles: true }));
    expect(viewport.zoom).toBe(.25);
  });

  it("zooms around a canvas pointer anchor", () => {
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const viewport = new CanvasViewportController(model);
    model.create({ name: "anchor", width: 100, height: 50, transparent: true, background: "#fff" });
    let width = 100, height = 50;
    Object.defineProperty(model.overlay, "getBoundingClientRect", { configurable: true, value: () => ({ left: 10, top: 20, width, height, right: 10 + width, bottom: 20 + height, x: 10, y: 20, toJSON: () => ({}) }) });
    viewport.zoomAt(60, 45, 1);
    width = 125; height = 62.5;
    viewport.zoomAt(60, 45, -1);
    expect(viewport.zoom).toBe(1);
  });

  it("keeps rulers pinned to the visible viewport while the zoomed canvas scrolls", () => {
    const wrap = document.querySelector<HTMLElement>("#canvasWrap")!;
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    new CanvasViewportController(model);
    model.create({ name: "scrollable", width: 1000, height: 800, transparent: true, background: "#fff" });

    wrap.scrollLeft = 240;
    wrap.scrollTop = 175;
    wrap.dispatchEvent(new Event("scroll"));

    expect(document.querySelector<HTMLElement>(".horizontal-ruler")!.style.transform).toBe("");
    expect(document.querySelector<HTMLElement>(".vertical-ruler")!.style.transform).toBe("");
    expect(document.querySelector<HTMLElement>(".ruler-corner")!.style.transform).toBe("");
    expect(document.querySelector<HTMLElement>(".horizontal-ruler")!.style.getPropertyValue("--ruler-scroll")).toBe("240px");
    expect(document.querySelector<HTMLElement>(".vertical-ruler")!.style.getPropertyValue("--ruler-scroll")).toBe("175px");
  });

  it("does not size rulers from a restored canvas while it is initially hidden", () => {
    const wrap = document.querySelector<HTMLElement>("#canvasWrap")!;
    Object.defineProperty(wrap, "clientWidth", { configurable: true, value: 0 });
    Object.defineProperty(wrap, "clientHeight", { configurable: true, value: 0 });
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    new CanvasViewportController(model);
    model.create({ name: "restored", width: 800, height: 600, transparent: true, background: "#fff" });

    expect(document.querySelector<HTMLElement>(".horizontal-ruler")!.style.width).toBe("");
    expect(document.querySelector<HTMLElement>(".vertical-ruler")!.style.height).toBe("");
  });
});
