import { PIXELS_PER_UNIT, type MeasurementUnit } from "../models/measurementUnits";

const NICE_MULTIPLIERS = [1, 2, 5, 10] as const;

export interface RulerTick {
  readonly pixelPosition: number;
  readonly label: string;
}

export function pixelsToUnit(pixels: number, unit: MeasurementUnit): number {
  return pixels / PIXELS_PER_UNIT[unit];
}

export function unitToPixels(value: number, unit: MeasurementUnit): number {
  return value * PIXELS_PER_UNIT[unit];
}

export function rulerStep(zoom: number, unit: MeasurementUnit, minimumScreenSpacing = 56): number {
  const minimumUnitStep = minimumScreenSpacing / (zoom * PIXELS_PER_UNIT[unit]);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(minimumUnitStep, Number.EPSILON)));
  return NICE_MULTIPLIERS.find(multiplier => multiplier * magnitude >= minimumUnitStep)! * magnitude;
}

export function rulerTicks(pixelLength: number, zoom: number, unit: MeasurementUnit, minimumScreenSpacing = 56): RulerTick[] {
  if (pixelLength <= 0 || zoom <= 0) return [];
  const step = rulerStep(zoom, unit, minimumScreenSpacing);
  const unitLength = pixelsToUnit(pixelLength, unit);
  const precision = step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0;
  const ticks: RulerTick[] = [];
  for (let value = 0; value <= unitLength + step / 1000; value += step) {
    ticks.push({ pixelPosition: unitToPixels(value, unit) * zoom, label: formatMeasurement(value, precision) });
  }
  return ticks;
}

function formatMeasurement(value: number, precision: number): string {
  return Number(value.toFixed(precision)).toString();
}
