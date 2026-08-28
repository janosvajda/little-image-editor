import { beforeEach, describe, expect, it, vi } from "vitest";

async function boot(): Promise<void> {
  vi.resetModules();
  await import("../../src/editor");
}

function click(selector: string): void {
  document.querySelector<HTMLButtonElement>(selector)!.click();
}

function selectTool(tool: string): void {
  const selector = ["pencil", "brush", "marker", "highlighter", "calligraphy", "spray", "eraser"].includes(tool) ? "#paintToolSelect" : "#shapeToolSelect";
  const select = document.querySelector<HTMLSelectElement>(selector)!;
  select.value = tool; select.dispatchEvent(new Event("change"));
}

describe("editor integration", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("saved.png");
    document.querySelector<HTMLInputElement>("#newImageName")!.value = "integration-image";
  });

  it("creates a new image and exercises editing, history, transforms, and saving", async () => {
    await boot();
    click("#newImageButton");
    expect(document.querySelector<HTMLDialogElement>("#newImageDialog")!.open).toBe(true);
    const preset = document.querySelector<HTMLSelectElement>("#newImagePreset")!;
    preset.value = "1280x720"; preset.dispatchEvent(new Event("change"));
    const newFormat = document.querySelector<HTMLSelectElement>("#newImageFormat")!;
    expect([...newFormat.options].map(option => option.text)).toEqual([
      "Little Image Editor (.limg) — preserves layers",
      "PNG — flattened image",
      "JPEG — flattened image",
      "WebP — flattened image",
    ]);
    newFormat.value = "image/webp";
    expect(document.querySelector<HTMLInputElement>("#newImageWidth")!.value).toBe("1280");
    click("#createImageButton");
    expect(document.querySelector("#canvasWrap")!.classList.contains("hidden")).toBe(false);
    expect(document.querySelector<HTMLButtonElement>("#saveButton")!.disabled).toBe(false);
    expect(document.querySelector<HTMLSelectElement>("#formatSelect")!.value).toBe("image/webp");
    expect(document.querySelector<HTMLButtonElement>("#exportButton")!.disabled).toBe(false);

    const effect = document.querySelector<HTMLSelectElement>("#effectSelect")!;
    for (const name of ["invert", "monochrome", "sepia", "sharpen"]) {
      effect.value = name; effect.dispatchEvent(new Event("change")); click("#applyEffectButton");
    }
    click("#rotateRightButton"); click("#rotateLeftButton"); click("#flipHButton"); click("#flipVButton");
    click("#undoButton"); click("#redoButton");
    click("#saveButton");
  });

  it("supports presets, aspect ratios, transparency warnings, tools, menus, themes, panels, and dialogs", async () => {
    await boot();
    expect(document.querySelector("#quickOpenButton")!.nextElementSibling?.id).toBe("quickSaveButton");
    const aspect = document.querySelector<HTMLSelectElement>("#newImageAspect")!;
    const width = document.querySelector<HTMLInputElement>("#newImageWidth")!;
    aspect.value = "1.6180339887"; aspect.dispatchEvent(new Event("change"));
    width.value = "1000"; width.dispatchEvent(new Event("input"));
    expect(document.querySelector<HTMLInputElement>("#newImageHeight")!.value).toBe("618");
    const transparent = document.querySelector<HTMLInputElement>("#newImageTransparent")!;
    transparent.click();
    expect(document.querySelector("#transparencyWarning")!.classList.contains("hidden")).toBe(false);

    click("#createImageButton");
    for (const tool of ["pencil", "brush", "marker", "highlighter", "calligraphy", "spray", "eraser", "line", "arrow", "rectangle", "roundedRectangle", "ellipse", "triangle", "diamond", "star"]) selectTool(tool);
    click('[data-tool="picker"]'); click('[data-tool="crop"]');
    click("#functionsButton"); click("#addSpriteButton");
    click("#resetLayoutButton");
    const theme = document.querySelector<HTMLSelectElement>("#themeSelect")!;
    theme.value = "dark"; theme.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    expect(document.querySelector<HTMLDetailsElement>("#fileMenu")!.open).toBe(true);
  });

  it("draws with pointer tools and crops", async () => {
    await boot();
    click("#createImageButton");
    const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) });
    const pointer = (type: string, x: number, y: number) => overlay.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as unknown as PointerEvent);
    for (const tool of ["pencil", "brush", "marker", "highlighter", "calligraphy", "spray", "eraser", "line", "arrow", "rectangle", "roundedRectangle", "ellipse", "triangle", "diamond", "star"]) {
      selectTool(tool); pointer("pointerdown", 10, 10); pointer("pointermove", 40, 30); pointer("pointerup", 40, 30);
    }
    selectTool("highlighter");
    click('[data-tool="picker"]'); pointer("pointerdown", 2, 2);
    pointer("pointerdown", 3, 3);
    expect(document.querySelector('[data-tool="picker"]')!.classList.contains("active")).toBe(true);
    document.querySelector<HTMLElement>("#paintToolControl")!.click();
    expect(document.querySelector("#paintToolControl")!.classList.contains("active")).toBe(true);
    expect(document.querySelector('[data-tool="picker"]')!.classList.contains("active")).toBe(false);
    pointer("pointerdown", 2, 2); pointer("pointermove", 5, 5); pointer("pointerup", 5, 5);
    click('[data-tool="crop"]'); pointer("pointerdown", 0, 0); pointer("pointermove", 20, 20); pointer("pointerup", 20, 20);
    expect(document.querySelector("#applyCropButton")!.classList.contains("hidden")).toBe(false);
    click("#applyCropButton");
    expect(document.querySelector("#dimensions")!.textContent).toBe("20 × 20 px");
  });

  it("previews and resets every adjustment", async () => {
    await boot(); click("#createImageButton");
    for (const name of ["brightness", "contrast", "saturation"]) {
      const input = document.querySelector<HTMLInputElement>(`[data-filter="${name}"]`)!;
      input.value = "25"; input.dispatchEvent(new Event("input")); input.dispatchEvent(new Event("change"));
      expect(document.querySelector(`#${name}Value`)!.textContent).toBe("25");
    }
    const brightness = document.querySelector<HTMLInputElement>('[data-filter="brightness"]')!;
    brightness.value = "10"; brightness.dispatchEvent(new Event("input")); click("#resetFiltersButton");
    expect(document.querySelector("#brightnessValue")!.textContent).toBe("0");
    expect(document.querySelector("#contrastValue")!.textContent).toBe("0");
    expect(document.querySelector("#saturationValue")!.textContent).toBe("0");
    const width = document.querySelector<HTMLInputElement>("#widthInput")!, height = document.querySelector<HTMLInputElement>("#heightInput")!;
    width.value = "320"; height.value = "240"; click("#resizeButton");
    expect(document.querySelector("#dimensions")!.textContent).toBe("320 × 240 px");
  });

  it("queues frames and builds a sprite sheet", async () => {
    await boot();
    const input = document.querySelector<HTMLInputElement>("#spriteInput")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(document.querySelector("#spriteCount")!.textContent).toBe("2"));
    click("#buildSpriteButton");
    expect(document.querySelector("#dimensions")!.textContent).toBe("80 × 10 px");
  });

  it("navigates all menu directions and toggles focus and panels", async () => {
    await boot();
    const fileSummary = document.querySelector("#fileMenu summary")!;
    (fileSummary as HTMLElement).focus();
    for (const key of ["Enter", "Escape", " ", "ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"]) {
      (document.activeElement ?? fileSummary).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    click("#focusButton"); await Promise.resolve();
    expect(document.body.classList.contains("focus-mode")).toBe(true);
    click("#exitFocusButton");
    const collapse = document.querySelector<HTMLButtonElement>('.panel[data-panel="tools"] .collapse')!;
    collapse.click(); collapse.click();
    window.dispatchEvent(new Event("resize"));
  });
});
