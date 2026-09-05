import { describe, expect, it } from "vitest";
import { enhancePanelButtons } from "./panelButtonEnhancer";

describe("enhancePanelButtons", () => {
  it("uses one compact icon treatment for panel actions", () => {
    enhancePanelButtons();
    const reset = document.querySelector<HTMLButtonElement>("#resetFiltersButton")!;
    expect(reset.classList).toContain("panel-action");
    expect(reset.querySelector("svg")).not.toBeNull();
    expect(reset.textContent).toBe("Reset");
    expect(document.querySelector("#resizeButton svg")).not.toBeNull();
		expect(document.querySelector("#applyCropButton")).toBeNull();
  });
});
