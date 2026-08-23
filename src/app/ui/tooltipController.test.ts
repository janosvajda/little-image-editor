import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipController } from "./tooltipController";

describe("TooltipController", () => {
  afterEach(() => vi.useRealTimers());

  it("shows titled controls on hover and hides them when the pointer leaves", () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    button.title = "Zoom in"; document.body.append(button);
    new TooltipController();
    button.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, clientX: 20, clientY: 30 }));
    vi.advanceTimersByTime(350);
    const tooltip = document.querySelector<HTMLElement>("#appTooltip")!;
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toBe("Zoom in");
    expect(button.dataset.tooltip).toBe("Zoom in");
    expect(button.title).toBe("");
    expect(button.getAttribute("aria-describedby")).toBe("appTooltip");
    button.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
    expect(tooltip.hidden).toBe(true);
  });

  it("shows immediately for keyboard focus and supplies an accessible label", () => {
    const button = document.createElement("button");
    button.title = "Fit image"; document.body.append(button);
    new TooltipController();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.querySelector<HTMLElement>("#appTooltip")!.textContent).toBe("Fit image");
    expect(button.getAttribute("aria-label")).toBe("Fit image");
    button.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(document.querySelector<HTMLElement>("#appTooltip")!.hidden).toBe(true);
  });

  it("does not reopen a tooltip when pointer focus returns from a native dialog", () => {
    const button = document.createElement("button");
    button.title = "Save image"; document.body.append(button);
    new TooltipController();
    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.querySelector<HTMLElement>("#appTooltip")!.hidden).toBe(true);
  });
});
