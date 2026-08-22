import { describe, expect, it } from "vitest";
import { WorkspaceUi } from "./workspaceController";

describe("WorkspaceUi", () => {
  it("restores panel layout and handles focus lifecycle", async () => {
    localStorage.setItem("little-editor.panel-layout.v2", JSON.stringify({ tools: { x: 5, y: 6, collapsed: true } }));
    const ui = new WorkspaceUi([document.querySelector<HTMLDialogElement>("#newImageDialog")!]);
    expect(document.querySelector('.panel[data-panel="tools"]')!.classList.contains("collapsed")).toBe(true);
    await ui.toggleFocus(true); expect(document.body.classList.contains("focus-mode")).toBe(true);
    await ui.toggleFocus(false); ui.openFileMenu(); expect(document.querySelector<HTMLDetailsElement>("#fileMenu")!.open).toBe(true);
  });

  it("stacks default panels without overlap and saves their initial layout", async () => {
    const workspace = document.querySelector<HTMLElement>(".workspace")!;
    Object.defineProperty(workspace, "clientWidth", { configurable: true, value: 1200 });
    Object.defineProperty(workspace, "clientHeight", { configurable: true, value: 900 });
    const sizes: Record<string, { width: number; height: number }> = {
      tools: { width: 230, height: 500 }, adjust: { width: 220, height: 360 }, transform: { width: 220, height: 190 }
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
    const transform = document.querySelector<HTMLElement>('[data-panel="transform"]')!;
    expect(adjust.style.top).toBe("14px");
    expect(transform.style.top).toBe("388px");
    expect(Number.parseInt(transform.style.top)).toBeGreaterThanOrEqual(Number.parseInt(adjust.style.top) + 360 + 14);
    expect(JSON.parse(localStorage.getItem("little-editor.panel-layout.v2")!)).toMatchObject({
      adjust: { y: 14 }, transform: { y: 388 }
    });
  });
});
