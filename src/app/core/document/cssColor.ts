/** CSS colours as the editor writes them. */

const HEX_COLOR = /^#([\da-f]{6})$/i;
const HEX_PAIR = /.{2}/g;
const HEX_RADIX = 16;

/** A `#rrggbb` colour with an alpha, as CSS writes one; any other colour is kept as it is. */
export function colorWithAlpha(color: string, alpha: number): string {
	const digits = HEX_COLOR.exec(color)?.[1];
	if (!digits || alpha >= 1) return color;
	const [red, green, blue] = digits.match(HEX_PAIR)!.map((pair) => Number.parseInt(pair, HEX_RADIX));
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
