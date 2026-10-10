/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import editorHtml from '../../../editor.html?raw';
import fillCursorSvg from '../../../assets/cursors/fillCursor.svg?raw';
import editorCss from '../../../editor.css?raw';
import drawingToolsCss from '../../../drawingTools.css?raw';
import annotationToolsCss from '../../../annotationTools.css?raw';
import { ColorPalette } from '../../core/document/colorPalette';
import { colorPaletteStylesheet, resolveColorPaletteReferences } from './colorPaletteAssets';

describe('palette references in static assets', () => {
	it('preserves HTML colour-input defaults and resolves standalone SVG cursor colours', () => {
		const html = resolveColorPaletteReferences(editorHtml);
		const editor = new DOMParser().parseFromString(html, 'text/html');
		expect(editor.querySelector<HTMLInputElement>('#colorInput')?.defaultValue).toBe(ColorPalette.White);
		expect(editor.querySelector<HTMLInputElement>('#newImageColor')?.defaultValue).toBe(ColorPalette.White);
		const cursor = resolveColorPaletteReferences(fillCursorSvg);
		const svg = new DOMParser().parseFromString(cursor, 'image/svg+xml');
		expect(svg.querySelector('parsererror')).toBeNull();
		expect(svg.querySelector('path')?.getAttribute('fill')).toBe(ColorPalette.White);
		expect(svg.querySelector('path')?.getAttribute('stroke')).toBe(ColorPalette.MidnightBlue);
	});

	it('validates all editor styles and produces a separate palette stylesheet', () => {
		for (const asset of [editorCss, drawingToolsCss, annotationToolsCss])
			expect(() => resolveColorPaletteReferences(asset)).not.toThrow();
		expect(colorPaletteStylesheet()).toContain(`--color-white: ${ColorPalette.White};`);
	});

	it.each(['Missing', 'constructor', 'Incorrect_Name'])('rejects the unknown HTML/SVG colour %s', (name) => {
		expect(() => resolveColorPaletteReferences(`fill="{{ColorPalette.${name}}}"`)).toThrow(`Unknown ColorPalette colour: ${name}`);
	});

	it('rejects unknown palette CSS variables while retaining existing theme variables', () => {
		expect(() => resolveColorPaletteReferences('color: var(--color-unknown);')).toThrow('Unknown ColorPalette CSS variable: --color-unknown');
		expect(resolveColorPaletteReferences('color: var(--accent);')).toBe('color: var(--accent);');
	});
});
