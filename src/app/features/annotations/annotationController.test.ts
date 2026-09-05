import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { AnnotationController } from "./annotationController";
import { CUT_MOVE_CROP_REQUEST_EVENT } from "../drawing/cropEvents";

describe("annotation UI controller", () => {
  let model: CanvasDocument;
  let controller: AnnotationController;

  beforeEach(() => {
    vi.restoreAllMocks();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((name: string, options?: ElementCreationOptions) => {
      const created = createElement(name, options);
      if (created instanceof HTMLCanvasElement) addMissingCanvasMethods(created.getContext("2d")!);
      return created;
    }) as typeof document.createElement);
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    model = new CanvasDocument(canvas, overlay);
    model.create({ name: "bug", width: 200, height: 100, transparent: false, background: "#fff" });
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: vi.fn() });
    const viewport = { addCanvasLayer(layer: HTMLCanvasElement) { overlay.before(layer); } };
    controller = new AnnotationController(model, viewport as never);
    addMissingCanvasMethods(controller.canvas.getContext("2d")!);
    addMissingCanvasMethods(model.context);
    controller.activate();
  });

  it("switches tools, creates objects, moves and deletes a selection, and supports annotation history", () => {
    controller.panel.toolButtons.get("step")!.click();
    pointer("pointerdown", 80, 40);
    expect(controller.annotations.state.nextStep).toBe(2);
    controller.panel.toolButtons.get("select")!.click();
    pointer("pointerdown", 80, 40); pointer("pointermove", 90, 45); pointer("pointerup", 90, 45);
    expect(controller.annotations.selected).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    expect(controller.annotations.state.objects).toHaveLength(0);
    controller.panel.undo.click();
    expect(controller.annotations.state.objects).toHaveLength(1);
    controller.panel.redo.click();
    expect(controller.annotations.state.objects).toHaveLength(0);
  });

  it("creates each drag annotation and routes crop to the shared cut-and-move tool", () => {
    for (const tool of ["arrow", "box", "highlight", "blur", "redact"] as const) {
      controller.panel.toolButtons.get(tool)!.click();
      pointer("pointerdown", 30, 20); pointer("pointermove", 70, 60); pointer("pointerup", 70, 60);
    }
    expect(controller.annotations.state.objects.map(object => object.type)).toEqual(["arrow", "box", "highlight", "blur", "redact"]);
    const cropRequested = vi.fn();
    document.addEventListener(CUT_MOVE_CROP_REQUEST_EVENT, cropRequested, { once: true });
    controller.panel.toolButtons.get("crop")!.click();
    expect(cropRequested).toHaveBeenCalledOnce();
    expect(model.width).toBe(200); expect(model.height).toBe(100);
  });

  it("creates text, restarts numbered markers, updates privacy preview, and flattens", async () => {
    controller.panel.text.value = "A callout";
    controller.panel.toolButtons.get("text")!.click(); pointer("pointerdown", 50, 50);
    expect(controller.annotations.state.objects[0]).toEqual(expect.objectContaining({ type: "text", text: "A callout" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true, cancelable: true }));
    expect(controller.panel.nextStep.textContent).toBe("Next marker: 1");
    controller.panel.expected.value = "Expected";
    controller.panel.expected.dispatchEvent(new Event("input", { bubbles: true }));
    expect(controller.panel.reportPreview.value).toContain("Expected: Expected");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    controller.panel.copyReport.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    controller.panel.flatten.click();
    expect(controller.annotations.state.objects).toHaveLength(0);
  });

  function pointer(type: string, x: number, y: number): void {
    model.overlay.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
  }
});

function addMissingCanvasMethods(context: CanvasRenderingContext2D): void {
  for (const method of ["arc", "fillText", "strokeRect", "clip"] as const) if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
}
