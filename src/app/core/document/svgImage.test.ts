import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_DIMENSION } from '../geometry/geometryHelpers';
import { isSvgFile, readSvg, SVG_MIME_TYPE, SvgDefaultSize } from './svgImage';

const svg = (attributes: string, content = '<rect width="10" height="10"/>') =>
	`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attributes}>${content}</svg>`;
const parsed = (markup: string) => new DOMParser().parseFromString(markup, SVG_MIME_TYPE).documentElement;

describe('opening an SVG image', () => {
	it('is recognised by its type or its name', () => {
		expect(isSvgFile({ type: SVG_MIME_TYPE, name: 'drawing' })).toBe(true);
		expect(isSvgFile({ type: '', name: 'Logo.SVG' })).toBe(true);
		expect(isSvgFile({ type: 'image/png', name: 'photo.png' })).toBe(false);
	});

	it('is drawn at the size it asks for, in any absolute unit', () => {
		expect(readSvg(svg('width="120" height="80"')).size).toEqual({ width: 120, height: 80 });
		expect(readSvg(svg('width="1in" height="72pt"')).size).toEqual({ width: 96, height: 96 });
		expect(readSvg(svg('width="2.54cm" height="6pc"')).size).toEqual({ width: 96, height: 96 });
	});

	it('takes its size from its viewBox, keeping proportions when only one side is given', () => {
		expect(readSvg(svg('viewBox="0 0 400 200"')).size).toEqual({ width: 400, height: 200 });
		expect(readSvg(svg('width="100" viewBox="0 0 400 200"')).size).toEqual({ width: 100, height: 50 });
		expect(readSvg(svg('height="100%" viewBox="0,0,30,60"')).size).toEqual({ width: 30, height: 60 });
	});

	it('is drawn at the web\'s default size when it gives none', () => {
		expect(readSvg(svg('')).size).toEqual({ width: SvgDefaultSize.Width, height: SvgDefaultSize.Height });
	});

	it('is scaled to fit a canvas when it asks for more, keeping its proportions and its picture', () => {
		const { size, svg: drawn } = readSvg(svg(`width="${MAX_CANVAS_DIMENSION * 2}" height="${MAX_CANVAS_DIMENSION}"`));
		expect(size).toEqual({ width: MAX_CANVAS_DIMENSION, height: MAX_CANVAS_DIMENSION / 2 });
		const root = parsed(drawn);
		expect(root.getAttribute('viewBox')).toBe(`0 0 ${MAX_CANVAS_DIMENSION * 2} ${MAX_CANVAS_DIMENSION}`);
		expect(root.getAttribute('width')).toBe(String(MAX_CANVAS_DIMENSION));
	});

	it('loses everything that could run or load from elsewhere, and keeps the drawing', () => {
		const { svg: drawn } = readSvg(
			svg(
				'width="10" height="10" onload="alert(1)"',
				`<script>alert(1)</script><foreignObject><div/></foreignObject>
				<rect id="kept" width="5" height="5" onclick="alert(2)"/>
				<image href="https://example.com/tracker.png"/><image xlink:href="http://example.com/x.png"/>
				<image id="inline" href="data:image/png;base64,AAAA"/><use href="#kept"/>`,
			),
		);
		const root = parsed(drawn);
		expect(root.getElementsByTagName('script')).toHaveLength(0);
		expect(root.getElementsByTagName('foreignObject')).toHaveLength(0);
		expect(root.hasAttribute('onload')).toBe(false);
		expect(root.querySelector('#kept')!.hasAttribute('onclick')).toBe(false);
		const images = [...root.getElementsByTagName('image')];
		expect(images.filter((image) => image.hasAttribute('href') || image.hasAttributeNS('http://www.w3.org/1999/xlink', 'href'))).toEqual([
			root.querySelector('#inline'),
		]);
		expect(root.getElementsByTagName('use')[0]!.getAttribute('href')).toBe('#kept');
	});

	it('refuses a file that is not an SVG image', () => {
		expect(() => readSvg('<html><body/></html>')).toThrow('The file is not a valid SVG image.');
		expect(() => readSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')).toThrow('The file is not a valid SVG image.');
	});
});
