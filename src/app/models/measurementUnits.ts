export const MEASUREMENT_UNITS = ["px", "mm", "cm", "in"] as const;
export type MeasurementUnit = typeof MEASUREMENT_UNITS[number];

export const PIXELS_PER_INCH = 96;

export const PIXELS_PER_UNIT: Readonly<Record<MeasurementUnit, number>> = {
  px: 1,
  mm: PIXELS_PER_INCH / 25.4,
  cm: PIXELS_PER_INCH / 2.54,
  in: PIXELS_PER_INCH
};

export const MEASUREMENT_UNIT_LABELS: Readonly<Record<MeasurementUnit, string>> = {
  px: "Pixels",
  mm: "Millimetres",
  cm: "Centimetres",
  in: "Inches"
};

export function pixelsPerUnit(unit: MeasurementUnit, pixelsPerInch = PIXELS_PER_INCH): number {
  if (unit === "px") return 1;
  if (unit === "in") return pixelsPerInch;
  return pixelsPerInch / (unit === "cm" ? 2.54 : 25.4);
}
