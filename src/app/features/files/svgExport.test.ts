import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { linearGradient } from '../../core/geometry/gradient';
import { parsePathData } from '../../core/geometry/vectorPath';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, LineDash } from '../annotations/annotationTypes';
import { LineEnd } from '../annotations/lineEnd';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { coveredBounds, SVG_NAMESPACE, svgDocument } from './svgExport';
import { escapeXml, SvgRecordingContext, svgElement, svgNumber } from './svgRecordingContext';

const parse = (markup: string) => new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;

describe('the SVG recording context', () => {
	const recorder = () => new SvgRecordingContext({ width: 100, height: 100 }, 'r-');

	it('writes filled and stroked paths, with their line style and fill rule', () => {
		const context = recorder();
		context.fillStyle = '#ff0000';
		context.strokeStyle = '#0000ff';
		context.lineWidth = 3;
		context.lineCap = 'round';
		context.setLineDash([6, 4]);
		context.beginPath();
		context.moveTo(0, 0);
		context.lineTo(10, 0);
		context.bezierCurveTo(10, 5, 5, 10, 0, 10);
		context.quadraticCurveTo(0, 5, 0, 0);
		context.closePath();
		context.fill('evenodd');
		context.stroke();
		expect(context.elements).toEqual([
			'<path d="M0 0L10 0C10 5 5 10 0 10Q0 5 0 0Z" fill-rule="evenodd" fill="#ff0000" stroke="none"/>',
			'<path d="M0 0L10 0C10 5 5 10 0 10Q0 5 0 0Z" fill="none" stroke="#0000ff" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 4"/>',
		]);
		expect(context.getLineDash()).toEqual([6, 4]);
	});

	it('writes whole circles as two arcs, and keeps transforms and fading within save and restore', () => {
		const context = recorder();
		context.save();
		context.translate(10, 20);
		context.rotate(Math.PI / 2);
		context.scale(2, 2);
		context.globalAlpha = 0.5;
		context.beginPath();
		context.arc(0, 0, 5, 0, Math.PI * 2);
		context.fill();
		context.restore();
		context.fillRect(1, 2, 3, 4);
		context.strokeRect(1, 2, 3, 4);
		const [circle, rect, outline] = context.elements;
		expect(circle).toContain('d="M5 0A5 5 0 0 1 -5 0A5 5 0 0 1 5 0"');
		expect(circle).toContain('opacity="0.5"');
		expect(circle).toContain('transform="matrix(0 2 -2 0 10 20)"');
		expect(rect).toBe('<rect x="1" y="2" width="3" height="4" fill="#000000"/>');
		expect(outline).toContain('fill="none" stroke="#000000" stroke-width="1"');
	});

	it('writes gradients as definitions in the drawing\'s own coordinates', () => {
		const context = recorder();
		const linear = context.createLinearGradient(0, 0, 100, 0);
		linear.addColorStop(0, '#000000');
		linear.addColorStop(1, '#ffffff');
		context.fillStyle = linear;
		context.fillRect(0, 0, 100, 10);
		const radial = context.createRadialGradient(50, 50, 0, 50, 50, 40);
		radial.addColorStop(0, '#ff0000');
		radial.addColorStop(1, '#0000ff');
		context.strokeStyle = radial;
		context.strokeRect(0, 0, 100, 100);
		expect(context.definitions[0]).toBe(
			'<linearGradient id="r-gradient-1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient>',
		);
		expect(context.definitions[1]).toContain('<radialGradient id="r-gradient-2" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="40"');
		expect(context.elements[0]).toContain('fill="url(#r-gradient-1)"');
		expect(context.elements[1]).toContain('stroke="url(#r-gradient-2)"');
	});

	it('writes text with its font, alignment and fitted width, escaped', () => {
		const context = recorder();
		context.font = '700 16px system-ui';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText('A & <B>', 50, 50, 40);
		expect(context.elements[0]).toBe(
			'<text x="50" y="50" style="font: 700 16px system-ui; white-space: pre" text-anchor="middle" dominant-baseline="middle" textLength="40" lengthAdjust="spacingAndGlyphs" fill="#000000">A &amp; &lt;B&gt;</text>',
		);
	});

	it('embeds drawn images as PNGs at their place and size', () => {
		const context = recorder();
		const canvas = document.createElement('canvas');
		canvas.width = 8;
		canvas.height = 4;
		vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
		context.drawImage(canvas, 5, 6, 16, 8);
		expect(context.elements[0]).toBe('<image href="data:image/png;base64,AAAA" x="5" y="6" width="16" height="8" preserveAspectRatio="none"/>');
	});

	it('writes short numbers and escaped attributes', () => {
		expect(svgNumber(1.23456)).toBe('1.235');
		expect(svgNumber(2)).toBe('2');
		expect(escapeXml('"a" & b')).toBe('&quot;a&quot; &amp; b');
		expect(svgElement('g', { id: 'x', hidden: undefined }, '')).toBe('<g id="x"></g>');
	});
});

describe('an SVG export', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	beforeEach(() => {
		model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'scene & co', width: 200, height: 100, transparent: false, background: '#ffffff' });
		objects = new AnnotationDocument();
		vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
	});

	const box = (id: string) => ({
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 10, y: 10, width: 50, height: 30 },
		color: '#333333',
		width: 2,
		opacity: 1,
		fill: true,
		fillGradient: linearGradient(['#ff0000', '#0000ff']),
	});

	it('is a standard SVG of the image\'s size, named after it, with the image\'s own picture first', () => {
		const svg = parse(svgDocument(model, objects.state));
		expect(svg.namespaceURI).toBe(SVG_NAMESPACE);
		expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')]).toEqual(['200', '100', '0 0 200 100']);
		expect(svg.querySelector('title')!.textContent).toBe('scene & co');
		expect(svg.children[1]!.tagName).toBe('image');
		model.layers.setVisible(CoreLayerId.Image, false);
		expect(parse(svgDocument(model, objects.state)).querySelector('image')).toBeNull();
	});

	it('draws vector items as the SVG elements for them in a group per layer named by its title, with gradients and line ends defined once', () => {
		objects.add(box('a'));
		objects.add({
			id: 'curve',
			type: AnnotationObjectTypeId.Path,
			contours: parsePathData('M0 0 C 20 -20 40 20 60 0'),
			color: '#12ab34',
			width: 3,
			opacity: 1,
			fill: false,
			dash: LineDash.Solid,
			head: LineEnd.Arrow,
		});
		const svg = parse(svgDocument(model, objects.state));
		const group = svg.querySelector('g')!;
		expect(group.id).toMatch(/^layer-/);
		expect(group.querySelector('title')!.textContent).toBe(objects.state.layers[0]!.name);
		const rect = group.querySelector('rect')!;
		expect([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['10', '10', '50', '30']);
		expect(rect.getAttribute('fill')).toMatch(/^url\(#/);
		expect(rect.getAttribute('stroke')).toBe('#333333');
		expect(svg.querySelectorAll('defs linearGradient')).toHaveLength(1);
		const curve = group.querySelector('path[d^="M0 0C"]')!;
		const marker = svg.querySelector(`marker[id="${curve.getAttribute('marker-end')!.slice('url(#'.length, -1)}"]`)!;
		expect(marker.getAttribute('data-line-end')).toBe(LineEnd.Arrow);
		expect(curve.hasAttribute('marker-start')).toBe(false);
	});

	it('gives layers their opacity and blend mode, numbers ids of layers with one name, and leaves out what is hidden', () => {
		objects.add(box('a'));
		objects.setLayerAppearance(objects.state.layers[0]!.id, { name: 'Top', opacity: 0.5, blendMode: BlendMode.Multiply });
		objects.setLayerAppearance(objects.createLayer(), { name: 'Top' });
		objects.add(box('b'));
		const hidden = objects.createLayer();
		objects.add(box('c'));
		objects.setLayerVisible(hidden, false);
		const groups = [...parse(svgDocument(model, objects.state)).querySelectorAll('g')];
		expect(groups.map(({ id }) => id)).toEqual(['layer-Top', 'layer-Top-2']);
		expect(groups[0]!.getAttribute('opacity')).toBe('0.5');
		expect(groups[0]!.getAttribute('style')).toBe('mix-blend-mode: multiply');
		model.layers.setVisible(CoreLayerId.Objects, false);
		expect(parse(svgDocument(model, objects.state)).querySelector('g')).toBeNull();
	});

	it('embeds pixel items, and erased vector items, as pictures cropped to what they cover', () => {
		objects.add({
			id: 'stroke',
			type: AnnotationObjectTypeId.Stroke,
			layerId: CoreLayerId.Objects,
			tool: PaintToolId.Brush,
			points: [
				{ x: 5, y: 5, pressure: 1 },
				{ x: 50, y: 50, pressure: 1 },
			],
			rect: { x: 5, y: 5, width: 45, height: 45 },
			color: '#000000',
			size: 6,
			opacity: 1,
			hardness: 1,
			seed: 1,
		});
		const svg = svgDocument(model, objects.state);
		// The test canvas paints every pixel, so the stroke covers the whole image.
		expect(parse(svg).querySelector('g image')!.getAttribute('width')).toBe('200');
		expect(svg).not.toContain('<path');
	});

	it('finds the box around what shows, or nothing', () => {
		const data = new Uint8ClampedArray(4 * 4 * 4);
		data[(1 * 4 + 2) * 4 + 3] = 255;
		data[(3 * 4 + 1) * 4 + 3] = 10;
		expect(coveredBounds({ data, width: 4, height: 4 })).toEqual({ x: 1, y: 1, width: 2, height: 3 });
		expect(coveredBounds({ data: new Uint8ClampedArray(16), width: 2, height: 2 })).toBeNull();
	});

	it('is what assistants get when they ask for SVG', () => {
		objects.add(box('a'));
		const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
		const result = runner.run({ kind: AssistantCommandKind.ExportSvg });
		expect(result).toEqual({ svg: { markup: svgDocument(model, objects.state), width: 200, height: 100 } });
	});
});
