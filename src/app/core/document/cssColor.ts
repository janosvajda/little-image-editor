import { Numeric } from '../../shared/math/numericConstants';

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

/** A colour's red, green, blue and alpha in sRGB, each from 0 to 1. */
export type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
const ANY_HEX_COLOR = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
/** `rgb(…)` or `rgba(…)`, with commas or spaces and an optional `/ alpha`. */
const RGB_FUNCTION = /^rgba?\(\s*([^)]*)\)$/i;
const RGB_PART_SEPARATOR = /\s*[,/]\s*|\s+/;
const PERCENT = '%';
const RGB_CHANNELS = 3;
const RGBA_CHANNELS = 4;
const SHORT_HEX_LENGTHS: ReadonlySet<number> = new Set([RGB_CHANNELS, RGBA_CHANNELS]);
const HEX_DIGITS_PER_CHANNEL = 2;
const OPAQUE = 1;
/** Alpha digits kept when a colour is written, enough to tell 1/255 steps apart. */
const ALPHA_PRECISION = 4;

/** A CSS hex or `rgb()` colour as its channels; null for any other colour, such as a named one. */
export function parseCssColor(color: string): Rgba | null {
	const value = color.trim();
	const hex = ANY_HEX_COLOR.exec(value)?.[1];
	if (hex) return hexChannels(hex);
	const parts = RGB_FUNCTION.exec(value)?.[1]?.split(RGB_PART_SEPARATOR).filter(Boolean);
	if (!parts || (parts.length !== RGB_CHANNELS && parts.length !== RGBA_CHANNELS)) return null;
	const [red, green, blue, alpha] = parts;
	const channels = [red, green, blue].map((part) => channelValue(part!, Numeric.ByteMaximum));
	const opacity = alpha === undefined ? OPAQUE : channelValue(alpha, OPAQUE);
	return [...channels, opacity].every(Number.isFinite) ? [channels[0]!, channels[1]!, channels[2]!, opacity] : null;
}

/** Channels as CSS writes a colour: `#rrggbb` when opaque, otherwise `rgba()`. */
export function formatCssColor([red, green, blue, alpha]: Rgba): string {
	const bytes = [red, green, blue].map((channel) => Math.round(clampUnit(channel) * Numeric.ByteMaximum));
	const opacity = clampUnit(alpha);
	if (opacity >= OPAQUE) return `#${bytes.map((byte) => byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_CHANNEL, '0')).join('')}`;
	return `rgba(${bytes.join(', ')}, ${Number(opacity.toFixed(ALPHA_PRECISION))})`;
}

function hexChannels(hex: string): Rgba {
	const pairs = SHORT_HEX_LENGTHS.has(hex.length) ? [...hex].map((digit) => digit + digit) : (hex.match(HEX_PAIR) ?? []);
	const [red, green, blue, alpha] = pairs.map((pair) => Number.parseInt(pair, HEX_RADIX) / Numeric.ByteMaximum);
	return [red!, green!, blue!, alpha ?? OPAQUE];
}

/** A channel written as a number of `scale`, or as a percentage. */
function channelValue(part: string, scale: number): number {
	const percent = part.endsWith(PERCENT);
	const number = Number(percent ? part.slice(0, -PERCENT.length) : part);
	return clampUnit(percent ? number / Numeric.PercentScale : number / scale);
}

function clampUnit(value: number): number {
	return Math.min(1, Math.max(0, value));
}
