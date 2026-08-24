import { describe, expect, it, vi } from "vitest";
import { ShapeHandleId } from "../../core/geometry/shapeTransformHelpers";
import { TextShape } from "../../core/geometry/genericShape";
import { AnnotationObjectTypeId, type TextAnnotation } from "./annotationTypes";
import { InlineTextEditor } from "./inlineTextEditor";

describe("retained text frame editing", () => {
  it("moves, resizes, and rotates one persistent frame with the text", () => {
    const object: TextAnnotation = {
      id: "text", type: AnnotationObjectTypeId.Text, at: { x: 20, y: 40 }, text: "Label",
      color: "#000000", size: 20, rect: { x: 20, y: 20, width: 70, height: 26 }
    };
    const shape = new TextShape(object);
    shape.move({ x: 10, y: 15 });
    expect(object.rect).toEqual({ x: 30, y: 35, width: 70, height: 26 });
    expect(object.at).toEqual({ x: 30, y: 55 });

    shape.transform(ShapeHandleId.SouthEast, { x: 130, y: 87 });
    shape.transform(ShapeHandleId.Rotate, { x: 130, y: 20 });
    expect(shape.geometry.rect).toEqual(object.rect);
    expect(object.rotation).toBeTypeOf("number");
  });

  it("edits text in a focused control positioned at the canvas click", () => {
    const onCommit = vi.fn();
    new InlineTextEditor().open({
      value: "Old", clientX: 120, clientY: 80, fontSize: 20, color: "#000000",
      onInput: vi.fn(), onCommit, onCancel: vi.fn()
    });
    const input = document.querySelector<HTMLInputElement>(".annotation-inline-text")!;
    expect(input.style.left).toBe("120px"); expect(input.style.top).toBe("80px");
    input.value = "Edited";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith("Edited");
    expect(input.isConnected).toBe(false);
  });
});
