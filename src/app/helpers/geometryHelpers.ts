export const MAX_CANVAS_DIMENSION = 16_384;

export function clampDimension(value: string | number): number {
  return Math.max(1, Math.min(MAX_CANVAS_DIMENSION, Math.round(Number(value))));
}

export function linkedDimension(value: string | number, ratio: number, source: "width" | "height"): number {
  const numericValue = Number(value);
  return Math.max(1, Math.round(source === "width" ? numericValue / ratio : numericValue * ratio));
}
