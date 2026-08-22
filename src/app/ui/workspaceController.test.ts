import { describe, expect, it } from "vitest";
import { WorkspaceUi } from "./workspaceController.js";

describe("WorkspaceUi", () => {
  it("restores panel layout and handles focus lifecycle", async () => {
    localStorage.setItem("little-editor.panel-layout.v2", JSON.stringify({ tools: { x: 5, y: 6, collapsed: true } }));
    const ui = new WorkspaceUi([document.querySelector<HTMLDialogElement>("#newImageDialog")!]);
    expect(document.querySelector('.panel[data-panel="tools"]')!.classList.contains("collapsed")).toBe(true);
    await ui.toggleFocus(true); expect(document.body.classList.contains("focus-mode")).toBe(true);
    await ui.toggleFocus(false); ui.openFileMenu(); expect(document.querySelector<HTMLDetailsElement>("#fileMenu")!.open).toBe(true);
  });
});
