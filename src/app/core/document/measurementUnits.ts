export const MeasurementUnitId = {
	Pixel: 'px',
	Millimetre: 'mm',
	Centimetre: 'cm',
	Inch: 'in',
} as const;
export const MEASUREMENT_UNITS = Object.values(MeasurementUnitId);
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const PIXELS_PER_INCH = 96;
const LENGTHS_PER_INCH = { Millimetres: 25.4, Centimetres: 2.54 } as const;

export const PIXELS_PER_UNIT: Readonly<Record<MeasurementUnit, number>> = {
	[MeasurementUnitId.Pixel]: 1,
	[MeasurementUnitId.Millimetre]:
		PIXELS_PER_INCH / LENGTHS_PER_INCH.Millimetres,
	[MeasurementUnitId.Centimetre]:
		PIXELS_PER_INCH / LENGTHS_PER_INCH.Centimetres,
	[MeasurementUnitId.Inch]: PIXELS_PER_INCH,
};

export const MEASUREMENT_UNIT_LABELS: Readonly<
	Record<MeasurementUnit, string>
> = {
	[MeasurementUnitId.Pixel]: 'Pixels',
	[MeasurementUnitId.Millimetre]: 'Millimetres',
	[MeasurementUnitId.Centimetre]: 'Centimetres',
	[MeasurementUnitId.Inch]: 'Inches',
};

export function pixelsPerUnit(
	unit: MeasurementUnit,
	pixelsPerInch = PIXELS_PER_INCH,
): number {
	if (unit === MeasurementUnitId.Pixel) return 1;
	if (unit === MeasurementUnitId.Inch) return pixelsPerInch;
	return (
		pixelsPerInch /
		(unit === MeasurementUnitId.Centimetre
			? LENGTHS_PER_INCH.Centimetres
			: LENGTHS_PER_INCH.Millimetres)
	);
}
