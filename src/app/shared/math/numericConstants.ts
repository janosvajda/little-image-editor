export const Numeric = {
	AlphaMaximum: 255,
	ByteMaximum: 255,
	DegreesPerTurn: 360,
	DegreesPerHalfTurn: 180,
	DegreesPerQuarterTurn: 90,
	HalfDivisor: 2,
	PercentScale: 100,
} as const;

export function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / Numeric.DegreesPerHalfTurn;
}
