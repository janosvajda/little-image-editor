import { describe, expect, it } from "vitest";
import { DRAWING_TOOL_DEFINITIONS } from "./drawingToolCatalog";
import { DRAWING_TOOL_BEHAVIORS, DrawingToolKind, drawingToolBehavior } from "./drawingToolBehavior";
import { PaintToolId, ShapeToolId, UtilityToolId } from "../../core/document/appTypes";

describe("drawing tool behavior registry", () => {
  it("defines one complete behavior contract for every catalog tool", () => {
    expect(Object.keys(DRAWING_TOOL_BEHAVIORS).sort()).toEqual(DRAWING_TOOL_DEFINITIONS.map(tool => tool.id).sort());
  });

  it("encodes presentation and interaction categories without controller special cases", () => {
    expect(drawingToolBehavior(PaintToolId.Brush)).toMatchObject({ kind: DrawingToolKind.Paint, cursor: "crosshair", options: { color: true, hardness: true } });
    expect(drawingToolBehavior(PaintToolId.Eraser)).toMatchObject({ kind: DrawingToolKind.Paint, cursor: "cell", options: { color: false } });
    expect(drawingToolBehavior(ShapeToolId.Rectangle)).toMatchObject({ kind: DrawingToolKind.Shape, options: { shapeFill: true } });
    expect(drawingToolBehavior(UtilityToolId.Fill)).toMatchObject({ kind: DrawingToolKind.Fill, options: { fill: true, opacity: true } });
  });
});
