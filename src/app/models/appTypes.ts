export type PaintTool = "pencil" | "brush" | "marker" | "highlighter" | "calligraphy" | "spray" | "eraser";
export type ShapeTool = "line" | "arrow" | "rectangle" | "roundedRectangle" | "ellipse" | "triangle" | "diamond" | "star";
export type UtilityTool = "picker" | "crop" | "zoom" | "fill";
export type Tool = PaintTool | ShapeTool | UtilityTool;
export type Point = Readonly<{ x: number; y: number }>;
export type CropRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ImageFormat = string;

export interface NewImageOptions {
  name: string;
  width: number;
  height: number;
  transparent: boolean;
  background: string;
  format?: ImageFormat;
}

export interface ImageSnapshot {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  baseName: string;
  savedType: ImageFormat;
}

export type HistorySnapshot = Pick<ImageSnapshot, "width" | "height" | "pixels">;

export interface DocumentSessionSnapshot extends ImageSnapshot {
  history: HistorySnapshot[];
  historyIndex: number;
  toolbarStates?: Record<string, unknown>;
}
