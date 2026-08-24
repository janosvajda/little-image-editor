import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../../core/document/imageDocument";
import { ToolbarManager } from "../workspace/genericToolbar";
import { AnnotationPanel } from "./annotationPanel";

describe("annotation managed-toolbar architecture", () => {
  it("uses the standard panel contract and is owned by ToolbarManager", () => {
    const panel = new AnnotationPanel();
    document.body.append(panel.element);
    const model = new CanvasDocument(document.querySelector("#canvas")!, document.querySelector("#overlay")!);
    const manager = new ToolbarManager(model);

    expect(panel.element.matches('.panel[data-panel="annotations"]')).toBe(true);
    expect(panel.element.querySelectorAll(":scope > .panel-header")).toHaveLength(1);
    expect(panel.element.querySelectorAll(":scope > .panel-header .collapse")).toHaveLength(1);
    expect(panel.element.querySelectorAll(":scope > .panel-body")).toHaveLength(1);
    expect(panel.element.querySelectorAll(":scope > .panel-header button")).toHaveLength(1);
    expect(panel.element.querySelector('[aria-label*="Exit"], .annotation-exit')).toBeNull();
    expect(manager.get("annotationToolbar")?.root).toBe(panel.element);
    expect(panel.element.dataset.toolbarManaged).toBe("true");
  });
});
