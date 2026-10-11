import { describe, expect, it } from "vitest";
import { restoreToolState, saveToolState } from "./toolStatePersistence";

describe("toolStatePersistence", () => {
  it("automatically persists every identified input and select in a tool panel", () => {
    const root = document.querySelector('[data-panel="tools"]')!;
    const paint = document.querySelector<HTMLSelectElement>("#paintToolSelect")!;
    const color = document.querySelector<HTMLInputElement>("#colorInput")!;
    const style = document.querySelector<HTMLInputElement>("#shapeStyleInput")!;
    paint.value = "marker"; color.value = "#123456"; style.value = "fill";
    saveToolState(root, "marker");
    paint.value = "brush"; color.value = "#000000"; style.value = "outline";

    const restored = restoreToolState(root);
    expect(restored.activeTool).toBe("marker");
    expect(restored.restoredControlIds.has("paintToolSelect")).toBe(true);
    expect(restored.restoredControlIds.has("colorInput")).toBe(true);
    expect(restored.restoredControlIds.has("shapeStyleInput")).toBe(true);
    expect([paint.value, color.value, style.value]).toEqual(["marker", "#123456", "fill"]);
  });

  it("ignores unavailable values and removes invalid records", () => {
    const root = document.querySelector('[data-panel="tools"]')!;
    localStorage.setItem("littleImageEditor.drawingPreferences", JSON.stringify({ activeTool: "brush", controls: { paintToolSelect: "missing", colorInput: "invalid" } }));
    expect(restoreToolState(root).restoredControlIds.size).toBe(0);
    localStorage.setItem("littleImageEditor.drawingPreferences", "broken");
    expect(restoreToolState(root).activeTool).toBeNull();
    expect(localStorage.getItem("littleImageEditor.drawingPreferences")).toBeNull();
  });
});
