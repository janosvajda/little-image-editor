import { PIXELS_PER_INCH, pixelsPerUnit, type MeasurementUnit } from "../models/measurementUnits";

const NICE_MULTIPLIERS = [1, 2, 5, 10] as const;

export interface RulerTick {
  readonly pixelPosition: number;
  readonly label: string;
}

export function pixelsToUnit(pixels: number, unit: MeasurementUnit, pixelsPerInch = PIXELS_PER_INCH): number {
  return pixels / pixelsPerUnit(unit, pixelsPerInch);
}

export function unitToPixels(value: number, unit: MeasurementUnit, pixelsPerInch = PIXELS_PER_INCH): number {
  return value * pixelsPerUnit(unit, pixelsPerInch);
}

export function rulerStep(zoom: number, unit: MeasurementUnit, minimumScreenSpacing = 56, pixelsPerInch = PIXELS_PER_INCH): number {
  const minimumUnitStep = minimumScreenSpacing / (zoom * pixelsPerUnit(unit, pixelsPerInch));
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(minimumUnitStep, Number.EPSILON)));
  return NICE_MULTIPLIERS.find(multiplier => multiplier * magnitude >= minimumUnitStep)! * magnitude;
}

export function rulerTicks(pixelLength: number, zoom: number, unit: MeasurementUnit, minimumScreenSpacing = 56, pixelsPerInch = PIXELS_PER_INCH): RulerTick[] {
  if (pixelLength <= 0 || zoom <= 0) return [];
  const step = rulerStep(zoom, unit, minimumScreenSpacing, pixelsPerInch);
  const unitLength = pixelsToUnit(pixelLength, unit, pixelsPerInch);
  const precision = step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0;
  const ticks: RulerTick[] = [];
  for (let value = 0; value <= unitLength + step / 1000; value += step) {
    ticks.push({ pixelPosition: unitToPixels(value, unit, pixelsPerInch) * zoom, label: formatMeasurement(value, precision) });
  }
  return ticks;
}

function formatMeasurement(value: number, precision: number): string {
  return Number(value.toFixed(precision)).toString();
}
