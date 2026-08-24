import { describe, expect, it, vi } from "vitest";
import { createManagedPanel } from "./managedPanel";
import { ManagedToolbarRegistry } from "./managedToolbarPanel";
import { ToolbarVisibilityPicker } from "./toolbarVisibilityPicker";

describe("ToolbarVisibilityPicker", () => {
  it("discovers every registered toolbar and delegates visibility without toolbar-name branches", () => {
    const root = document.createElement("main");
    root.append(createManagedPanel("first", "First").element, createManagedPanel("future", "Future").element);
    const panels = new ManagedToolbarRegistry(root).panels;
    const host = document.createElement("nav");
    const change = vi.fn();
    new ToolbarVisibilityPicker(host, panels, change);

    const future = host.querySelector<HTMLInputElement>('[data-panel-toggle="future"]')!;
    future.checked = true;
    future.dispatchEvent(new Event("change", { bubbles: true }));
    expect(change).toHaveBeenCalledWith("future", true);
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(2);
  });
});
