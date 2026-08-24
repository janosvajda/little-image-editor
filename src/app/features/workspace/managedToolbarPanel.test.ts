import { describe, expect, it, vi } from "vitest";
import { createManagedPanel } from "./managedPanel";
import { ManagedToolbarRegistry } from "./managedToolbarPanel";

describe("ManagedToolbarRegistry", () => {
  it("gives every registered toolbar the same visibility, collapse, snapshot, restore, and reset behavior", () => {
    const root = document.createElement("div");
    const primary = createManagedPanel("primary", "Primary", { defaultVisible: true, autoOpenMode: "primary-mode" });
    const secondary = createManagedPanel("secondary", "Secondary");
    root.append(primary.element, secondary.element);
    const registry = new ManagedToolbarRegistry(root);
    expect(registry.findByAutoOpenMode("primary-mode")).toBe(registry.get("primary"));

    for (const panel of registry.panels) {
      const collapsed = vi.fn();
      panel.onCollapseChange(collapsed);
      panel.collapseButton.click();
      expect(panel.collapsed).toBe(true);
      expect(collapsed).toHaveBeenCalledWith(true);
      panel.setVisible(true);
      expect(panel.snapshot()).toMatchObject({ visible: true, collapsed: true });
      panel.restore({ x: 10, y: 20, visible: false, collapsed: false });
      expect(panel.visible).toBe(false);
      expect(panel.collapsed).toBe(false);
      panel.reset();
      expect(panel.visible).toBe(panel.defaultVisible);
      expect(panel.collapsed).toBe(false);
    }
  });

  it("rejects duplicate toolbar identities", () => {
    const root = document.createElement("div");
    root.append(createManagedPanel("duplicate", "One").element, createManagedPanel("duplicate", "Two").element);
    expect(() => new ManagedToolbarRegistry(root)).toThrow(/unique/);
  });
});
