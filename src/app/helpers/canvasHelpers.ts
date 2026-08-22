import type { ImageFormat } from "../models/appTypes.js";
import { canvasContext } from "./domHelpers.js";

export function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  canvasContext(copy).drawImage(source, 0, 0);
  return copy;
}

export function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index]! < 255) return true;
  }
  return false;
}

export function encodeCanvas(source: HTMLCanvasElement, type: ImageFormat, quality = .92): Promise<Blob> {
  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const context = canvasContext(output);
  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
  }
  context.drawImage(source, 0, 0);
  return new Promise((resolve, reject) => {
    output.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image encoding failed")), type, quality);
  });
}
