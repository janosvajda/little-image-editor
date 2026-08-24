import { describe, expect, it, vi } from "vitest";
import { AnnotationDocument, annotationBounds, normalizedRect } from "./annotationDocument";

describe("non-destructive annotation document", () => {
  it("adds, selects, moves, resizes, deletes, undoes, and redoes objects", () => {
    const document = new AnnotationDocument();
    const changed = vi.fn();
    document.onChange(changed);
    document.add({ id: "box", type: "box", rect: { x: 10, y: 20, width: 30, height: 40 }, color: "#f00", width: 3, opacity: 1, blur: 8 });
    expect(document.hitTest({ x: 20, y: 30 })?.id).toBe("box");
    document.move("box", { x: 5, y: -5 });
    expect(annotationBounds(document.selected!)).toEqual({ x: 15, y: 15, width: 30, height: 40 });
    document.resizeSelected({ x: 65, y: 75 });
    expect(annotationBounds(document.selected!)).toEqual({ x: 15, y: 15, width: 50, height: 60 });
    document.removeSelected();
    expect(document.state.objects).toHaveLength(0);
    document.undo();
    expect(document.state.objects).toHaveLength(1);
    document.redo();
    expect(document.state.objects).toHaveLength(0);
    expect(changed).toHaveBeenCalled();
  });

  it("increments numbered markers and can explicitly restart the sequence", () => {
    const document = new AnnotationDocument();
    document.add({ id: "one", type: "step", at: { x: 5, y: 5 }, value: document.state.nextStep, color: "#f00", size: 24 });
    document.add({ id: "two", type: "step", at: { x: 15, y: 15 }, value: document.state.nextStep, color: "#f00", size: 24 });
    expect(document.state.objects.map(object => object.type === "step" ? object.value : 0)).toEqual([1, 2]);
    expect(document.state.nextStep).toBe(3);
    document.restartSteps();
    expect(document.state.nextStep).toBe(1);
  });

  it("restores persisted state without sharing mutable references", () => {
    const state = { objects: [{ id: "a", type: "arrow" as const, from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, color: "#000", width: 2 }], nextStep: 7 };
    const document = new AnnotationDocument();
    document.restore(state);
    state.objects[0]!.to.x = 99;
    expect(document.state).toEqual({ objects: [{ ...state.objects[0], to: { x: 3, y: 4 } }], nextStep: 7 });
    expect(normalizedRect({ x: 8, y: 9 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 3, width: 6, height: 6 });
  });

  it("handles empty commands and hit-tests arrows, text, and markers", () => {
    const document = new AnnotationDocument();
    document.clear(); document.removeSelected(); document.undo(); document.redo();
    document.update("missing", () => { throw new Error("must not run"); });
    document.add({ id: "arrow", type: "arrow", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, color: "#000", width: 2 });
    document.add({ id: "text", type: "text", at: { x: 10, y: 30 }, text: "Hello", color: "#000", size: 12 });
    document.add({ id: "step", type: "step", at: { x: 80, y: 60 }, value: 1, color: "#000", size: 20 });
    expect(document.hitTest({ x: 50, y: 3 })?.id).toBe("arrow");
    expect(document.hitTest({ x: 15, y: 25 })?.id).toBe("text");
    expect(document.hitTest({ x: 80, y: 60 })?.id).toBe("step");
    expect(document.hitTest({ x: 190, y: 90 })).toBeNull();
  });
});
