import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../models/drawingToolCatalog";
import { GroupedToolPalette } from "./groupedToolPalette";

type TestTool = "brush" | "marker" | "shape";
const tools = [
  { id: "brush", label: "Brush", icon: "B", title: "Brush" },
  { id: "marker", label: "Marker", icon: "M", title: "Marker" }
] as const satisfies readonly ToolDefinition<TestTool>[];
const shapeTools = [
  { id: "shape", label: "Shape", icon: "S", title: "Shape" }
] as const satisfies readonly ToolDefinition<TestTool>[];

function setup(active: TestTool = "brush") {
  const root = document.createElement("div");
  const select = document.createElement("select");
  const shapeSelect = document.createElement("select");
  select.append(new Option("Brush", "brush"), new Option("Marker", "marker")); select.value = "brush";
  shapeSelect.append(new Option("Shape", "shape")); shapeSelect.value = "shape";
  document.body.append(root, select, shapeSelect);
  const onSelect = vi.fn();
  const palette = new GroupedToolPalette<TestTool>(root, [
    { label: "Paint", select, tools },
    { label: "Shapes", select: shapeSelect, tools: shapeTools }
  ], active, onSelect);
  const buttons = root.querySelectorAll<HTMLButtonElement>(".palette-group-button");
  const triggers = root.querySelectorAll<HTMLButtonElement>(".palette-menu-trigger");
  const menu = root.querySelector<HTMLElement>('[role="menu"][aria-label="Paint"]')!;
  const shapeMenu = root.querySelector<HTMLElement>('[role="menu"][aria-label="Shapes"]')!;
  return { root, select, onSelect, palette, button: buttons[0]!, menuTrigger: triggers[0]!, menu, shapeButton: buttons[1]!, shapeMenuTrigger: triggers[1]!, shapeMenu };
}

afterEach(() => vi.useRealTimers());

describe("GroupedToolPalette", () => {
  it("activates the selected tool from the main button and opens only from its triangle", () => {
    const subject = setup("shape");
    subject.button.click();
    expect(subject.onSelect).toHaveBeenCalledWith("brush");
    expect(subject.menu.classList).toContain("hidden");
    subject.menuTrigger.click();
    expect(subject.menu.classList).not.toContain("hidden"); expect(subject.menuTrigger.getAttribute("aria-expanded")).toBe("true");
    subject.menu.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
    expect(subject.select.value).toBe("marker"); expect(subject.menu.classList).toContain("hidden");
  });

  it("opens with context menu and keyboard and closes by toggle or outside pointer", () => {
    const subject = setup();
    subject.button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(subject.menu.classList).not.toContain("hidden");
    subject.root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(subject.menu.classList).not.toContain("hidden");
    subject.menuTrigger.click(); expect(subject.menu.classList).toContain("hidden");
    subject.menuTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(subject.menu.classList).toContain("hidden");
    subject.menuTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(subject.menu.classList).not.toContain("hidden");
    subject.button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(subject.menu.classList).toContain("hidden");
  });

  it("supports complete keyboard navigation and restores focus on Escape", () => {
    const subject = setup();
    subject.menuTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    const items = subject.menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(items[0]);
    items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items[1]);
    items[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items[0]);
    items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items[1]);
    items[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(subject.menu.classList).toContain("hidden");
    expect(document.activeElement).toBe(subject.menuTrigger);
  });

  it("updates the displayed subtype and active state", () => {
    const subject = setup(); subject.select.value = "marker"; subject.palette.update("marker");
    expect(subject.button.querySelector(".palette-name")!.textContent).toBe("Marker");
    expect(subject.button.querySelector(".palette-icon")!.textContent).toBe("M");
    expect(subject.button.getAttribute("aria-label")).toBe("Paint: Marker");
    expect(subject.menu.querySelector('[role="menuitem"]')!.getAttribute("aria-label")).toBe("Brush");
    expect(subject.button.classList).toContain("active");
    subject.palette.update("shape"); expect(subject.button.classList).not.toContain("active");
  });

  it("switches directly between shapes and paint flyouts with one click", () => {
    const subject = setup("shape");
    subject.shapeMenuTrigger.click();
    expect(subject.shapeMenu.classList).not.toContain("hidden");

    subject.menuTrigger.click();

    expect(subject.onSelect).not.toHaveBeenCalled();
    expect(subject.shapeMenu.classList).toContain("hidden");
    expect(subject.menu.classList).not.toContain("hidden");
    expect(subject.shapeMenuTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(subject.menuTrigger.getAttribute("aria-expanded")).toBe("true");
  });
});
