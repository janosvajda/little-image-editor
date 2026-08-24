import { describe, expect, it } from "vitest";
import { AnnotationDocument } from "./annotationDocument";

describe("annotation history session persistence", () => {
  it("restores the current history position with working undo and redo", () => {
    const original = new AnnotationDocument();
    original.add({ id: "one", type: "step", at: { x: 10, y: 10 }, value: 1, color: "#f00", size: 24 });
    original.add({ id: "two", type: "step", at: { x: 30, y: 30 }, value: 2, color: "#f00", size: 24 });
    original.undo();

    const restored = new AnnotationDocument();
    restored.restoreSession(original.snapshotSession());
    expect(restored.state.objects).toHaveLength(1);
    expect(restored.canUndo).toBe(true);
    expect(restored.canRedo).toBe(true);
    restored.redo();
    expect(restored.state.objects).toHaveLength(2);
    restored.undo();
    restored.undo();
    expect(restored.state.objects).toHaveLength(0);
  });

  it("normalizes an empty or out-of-range persisted history safely", () => {
    const restored = new AnnotationDocument();
    restored.restoreSession({ state: { objects: [], nextStep: 4 }, history: [], historyIndex: 99 });
    expect(restored.state.nextStep).toBe(4);
    expect(restored.canUndo).toBe(false);
    expect(restored.canRedo).toBe(false);
  });
});
