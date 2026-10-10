import {
	ColorPalette,
	type PaletteColorName,
} from '../../core/document/colorPalette';

const PALETTE_TOKEN_PATTERN = /\{\{ColorPalette\.([^{}]+)\}\}/g;
const PALETTE_CSS_REFERENCE_PATTERN = /var\((--color-[a-z0-9-]+)/g;

function paletteCssName(name: PaletteColorName): string {
	return `--color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).slice(1)}`;
}

const paletteCssNames = new Set(
	Object.keys(ColorPalette).map((name) =>
		paletteCssName(name as PaletteColorName),
	),
);

/** Generated before the editor styles load, so themes never wait for JavaScript. */
export function colorPaletteStylesheet(): string {
	const declarations = Object.entries(ColorPalette).map(
		([name, value]) =>
			`  ${paletteCssName(name as PaletteColorName)}: ${value};`,
	);
	return `/* Generated from ColorPalette. */\n:root {\n${declarations.join('\n')}\n}\n`;
}

/** Resolves HTML/SVG defaults and rejects invalid palette references during builds. */
export function resolveColorPaletteReferences(source: string): string {
	for (const [, variable] of source.matchAll(PALETTE_CSS_REFERENCE_PATTERN))
		if (!paletteCssNames.has(variable!))
			throw new Error(`Unknown ColorPalette CSS variable: ${variable}`);
	return source.replace(PALETTE_TOKEN_PATTERN, (_token, name: string) => {
		if (!Object.hasOwn(ColorPalette, name))
			throw new Error(`Unknown ColorPalette colour: ${name}`);
		return ColorPalette[name as PaletteColorName];
	});
}
