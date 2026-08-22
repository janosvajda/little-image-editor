import type { PaintTool, ShapeTool, Tool, UtilityTool } from "./appTypes";

export interface ToolDefinition<TTool extends string = string> {
  id: TTool;
  label: string;
  icon: string;
  title: string;
}

export const PAINT_TOOL_DEFINITIONS = [
  { id: "pencil", label: "Pencil", icon: "✎", title: "Pencil (P)" },
  { id: "brush", label: "Brush", icon: "●", title: "Brush (B)" },
  { id: "marker", label: "Marker", icon: "▰", title: "Marker (M)" },
  { id: "highlighter", label: "Highlighter", icon: "▬", title: "Highlighter (H)" },
  { id: "calligraphy", label: "Calligraphy ink", icon: "◒", title: "Calligraphy brush (A)" },
  { id: "spray", label: "Spray paint", icon: "⁙", title: "Spray paint (S)" },
  { id: "eraser", label: "Eraser", icon: "◇", title: "Eraser (E)" }
] as const satisfies readonly ToolDefinition<PaintTool>[];

export const SHAPE_TOOL_DEFINITIONS = [
  { id: "line", label: "Line", icon: "╱", title: "Line (L)" },
  { id: "arrow", label: "Arrow", icon: "↗", title: "Arrow" },
  { id: "rectangle", label: "Rectangle", icon: "□", title: "Rectangle (R)" },
  { id: "roundedRectangle", label: "Rounded rectangle", icon: "▢", title: "Rounded rectangle" },
  { id: "ellipse", label: "Ellipse", icon: "○", title: "Ellipse (O)" },
  { id: "triangle", label: "Triangle", icon: "△", title: "Triangle" },
  { id: "diamond", label: "Diamond", icon: "◇", title: "Diamond" },
  { id: "star", label: "Star", icon: "☆", title: "Star" }
] as const satisfies readonly ToolDefinition<ShapeTool>[];

export const UTILITY_TOOL_DEFINITIONS = [
  { id: "picker", label: "Picker", icon: "⌾", title: "Color picker (I)" },
  { id: "crop", label: "Crop", icon: "⌗", title: "Crop (C)" }
] as const satisfies readonly ToolDefinition<UtilityTool>[];

export const DRAWING_TOOL_DEFINITIONS: readonly ToolDefinition<Tool>[] = [
  ...PAINT_TOOL_DEFINITIONS, ...SHAPE_TOOL_DEFINITIONS, ...UTILITY_TOOL_DEFINITIONS
];

export const PAINT_TOOLS = new Set<Tool>(PAINT_TOOL_DEFINITIONS.map(tool => tool.id));
export const SHAPE_TOOLS = new Set<Tool>(SHAPE_TOOL_DEFINITIONS.map(tool => tool.id));

export function isDrawingTool(value: string | null): value is Tool {
  return value !== null && DRAWING_TOOL_DEFINITIONS.some(tool => tool.id === value);
}
