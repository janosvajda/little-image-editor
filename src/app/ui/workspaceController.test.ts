import { describe, expect, it } from "vitest";
import { WorkspaceUi } from "./workspaceController";

describe("WorkspaceUi", () => {
  it("restores panel layout and handles focus lifecycle", async () => {
    localStorage.setItem("little-editor.panel-layout.v2", JSON.stringify({ tools: { x: 5, y: 6, collapsed: true } }));
    const ui = new WorkspaceUi([document.querySelector<HTMLDialogElement>("#newImageDialog")!]);
    expect(document.querySelector("#menuFocusButton span")!.textContent).toBe("Fullscreen");
    expect(document.querySelector<HTMLElement>("#focusButton")!.title).toBe("Fullscreen (Tab)");
    expect(document.querySelector('.panel[data-panel="tools"]')!.classList.contains("collapsed")).toBe(true);
    await ui.toggleFocus(true); expect(document.body.classList.contains("focus-mode")).toBe(true);
    await ui.toggleFocus(false); ui.openFileMenu(); expect(document.querySelector<HTMLDetailsElement>("#fileMenu")!.open).toBe(true);
  });

  it("shows only Tools and Effects initially and persists toolbar visibility", async () => {
    new WorkspaceUi([]);
    expect(document.querySelector(".toolbar #toolbarPickerButton")).not.toBeNull();
    expect(document.querySelector(".toolbar")!.lastElementChild?.querySelector("#toolbarPickerButton")).not.toBeNull();
    expect(document.querySelector("#toolbarPickerButton span")!.textContent).toBe("Toolbars");
    expect(document.querySelector("#viewMenu .toolbar-visibility")).toBeNull();
    const tools = document.querySelector<HTMLElement>('[data-panel="tools"]')!;
    const adjust = document.querySelector<HTMLElement>('[data-panel="adjust"]')!;
    const effects = document.querySelector<HTMLElement>('[data-panel="effects"]')!;
    const transform = document.querySelector<HTMLElement>('[data-panel="transform"]')!;
    expect([tools.hidden, adjust.hidden, effects.hidden, transform.hidden]).toEqual([false, true, false, true]);

    const toggle = document.querySelector<HTMLInputElement>('[data-panel-toggle="adjust"]')!;
    toggle.click(); await new Promise(requestAnimationFrame);
    expect(adjust.hidden).toBe(false);
    expect(JSON.parse(localStorage.getItem("little-editor.panel-layout.v2")!)).toMatchObject({ adjust: { visible: true }, transform: { visible: false } });
  });

  it("stacks default panels without overlap and saves their initial layout", async () => {
    const workspace = document.querySelector<HTMLElement>(".workspace")!;
    Object.defineProperty(workspace, "clientWidth", { configurable: true, value: 1200 });
    Object.defineProperty(workspace, "clientHeight", { configurable: true, value: 900 });
    const sizes: Record<string, { width: number; height: number }> = {
      tools: { width: 230, height: 500 }, adjust: { width: 220, height: 360 }, effects: { width: 220, height: 220 }, transform: { width: 220, height: 190 }
    };
    document.querySelectorAll<HTMLElement>(".panel").forEach(panel => {
      const size = sizes[panel.dataset.panel!]!;
      Object.defineProperty(panel, "offsetParent", { configurable: true, value: workspace });
      Object.defineProperty(panel, "offsetWidth", { configurable: true, value: size.width });
      Object.defineProperty(panel, "offsetHeight", { configurable: true, value: size.height });
      Object.defineProperty(panel, "offsetLeft", { configurable: true, get: () => Number.parseInt(panel.style.left) || 0 });
      Object.defineProperty(panel, "offsetTop", { configurable: true, get: () => Number.parseInt(panel.style.top) || 0 });
    });

    new WorkspaceUi([]);
    await new Promise(requestAnimationFrame);

    const adjust = document.querySelector<HTMLElement>('[data-panel="adjust"]')!;
    const effects = document.querySelector<HTMLElement>('[data-panel="effects"]')!;
    const transform = document.querySelector<HTMLElement>('[data-panel="transform"]')!;
    expect(adjust.style.top).toBe("14px");
    expect(effects.style.top).toBe("388px");
    expect(transform.style.top).toBe("622px");
    expect(Number.parseInt(effects.style.top)).toBeGreaterThanOrEqual(Number.parseInt(adjust.style.top) + 360 + 14);
    expect(Number.parseInt(transform.style.top)).toBeGreaterThanOrEqual(Number.parseInt(effects.style.top) + 220 + 14);
    expect(JSON.parse(localStorage.getItem("little-editor.panel-layout.v2")!)).toMatchObject({
      adjust: { y: 14 }, effects: { y: 388 }, transform: { y: 622 }
    });
  });

  it("starts another dock column when expanded panels exceed the workspace height", async () => {
    const workspace = document.querySelector<HTMLElement>(".workspace")!;
    Object.defineProperty(workspace, "clientWidth", { configurable: true, value: 900 });
    Object.defineProperty(workspace, "clientHeight", { configurable: true, value: 720 });
    document.querySelectorAll<HTMLElement>(".panel").forEach(panel => {
      const heights: Record<string, number> = { tools: 500, adjust: 260, effects: 190, transform: 190 };
      Object.defineProperty(panel, "offsetParent", { configurable: true, value: workspace });
      Object.defineProperty(panel, "offsetWidth", { configurable: true, value: 220 });
      Object.defineProperty(panel, "offsetHeight", { configurable: true, value: heights[panel.dataset.panel!] });
      Object.defineProperty(panel, "offsetLeft", { configurable: true, get: () => Number.parseInt(panel.style.left) || 0 });
      Object.defineProperty(panel, "offsetTop", { configurable: true, get: () => Number.parseInt(panel.style.top) || 0 });
    });

    new WorkspaceUi([]);
    await new Promise(requestAnimationFrame);

    const effects = document.querySelector<HTMLElement>('[data-panel="effects"]')!;
    const transform = document.querySelector<HTMLElement>('[data-panel="transform"]')!;
    expect(transform.style.top).toBe("14px");
    expect(Number.parseInt(transform.style.left)).toBeLessThan(Number.parseInt(effects.style.left));
  });
});
