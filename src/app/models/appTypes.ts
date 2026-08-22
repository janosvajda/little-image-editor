export type Tool = "brush" | "eraser" | "line" | "rectangle" | "ellipse" | "picker" | "crop";
export type Point = Readonly<{ x: number; y: number }>;
export type CropRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ImageFormat = "image/png" | "image/jpeg" | "image/webp";

export interface NewImageOptions {
  name: string;
  width: number;
  height: number;
  transparent: boolean;
  background: string;
}
