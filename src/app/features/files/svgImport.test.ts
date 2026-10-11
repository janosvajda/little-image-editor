import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { matrixParts, parseTransform, transformPoint } from '../../core/geometry/affineMatrix';
import { GradientKind, linearGradient } from '../../core/geometry/gradient';
import { parsePathData } from '../../core/geometry/vectorPath';
import { BlendMode } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type ConnectorAnnotation,
	LineDash,
	type PathAnnotation,
	type ShapeAnnotation,
	type TextAnnotation,
} from '../annotations/annotationTypes';
import { LineEnd } from '../annotations/lineEnd';
import { svgDocument } from './svgExport';
import { importSvg } from './svgImport';
import { parseColor } from './svgPaint';
import { elementStyle, INITIAL_SVG_STYLE, SvgProperty, SvgStyleSheet } from './svgStyle';

const svg = (content: string, attributes = 'width="200" height="100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${content}</svg>`;

async function opened(markup: string) {
	const { document, editableObjects } = await importSvg(markup, 'drawing');
	const state = editableObjects.state;
	return { document, layers: state.layers ?? [], objects: state.objects };
}

async function onlyItem<Item extends AnnotationObject>(content: string): Promise<Item> {
	const { objects } = await opened(svg(content));
	expect(objects).toHaveLength(1);
	return objects[0] as Item;
}

describe('SVG transforms', () => {
	it('reads every transform function, in order, and refuses what is not one', () => {
		const point = { x: 1, y: 0 };
		expect(transformPoint(parseTransform('translate(10 20) scale(2)')!, point)).toEqual({ x: 12, y: 20 });
		const turned = transformPoint(parseTransform('rotate(90, 5, 5)')!, { x: 5, y: 0 });
		expect(turned.x).toBeCloseTo(10);
		expect(turned.y).toBeCloseTo(5);
		expect(parseTransform('matrix(1 0 0 1 3 4)')).toEqual([1, 0, 0, 1, 3, 4]);
		expect(matrixParts(parseTransform('skewX(30)')!).skewed).toBe(true);
		expect(matrixParts(parseTransform('skewY(30)')!).skewed).toBe(true);
		expect(parseTransform('')).toEqual([1, 0, 0, 1, 0, 0]);
		expect(parseTransform('wobble(3)')).toBeNull();
		expect(parseTransform('rotate(1 2)')).toBeNull();
		expect(parseTransform('translate(1) junk')).toBeNull();
	});

	it('takes a transform apart as a turn after a scale, mirrored when it flips', () => {
		const parts = matrixParts(parseTransform('rotate(30) scale(2 -3)')!);
		expect(parts.rotation).toBeCloseTo(30);
		expect(parts.scaleX).toBeCloseTo(2);
		expect(parts.scaleY).toBeCloseTo(-3);
		expect(parts.skewed).toBe(false);
	});
});

describe('SVG styles and colours', () => {
	it('resolves attributes, then the style sheet by specificity, then inline style, inheriting what SVG inherits', () => {
		const root = new DOMParser().parseFromString(
			svg('<style>/* c */ rect { stroke: blue } .a { fill: green } #b.a { fill: red } @media print { .a { fill: pink } }</style><g fill="orange" opacity="0.5"><rect id="b" class="a" fill="yellow" style="stroke-width: 4; font: italic 600 22px serif"/></g>'),
			'image/svg+xml',
		).documentElement;
		const sheet = new SvgStyleSheet(root);
		const group = root.querySelector('g')!;
		const groupStyle = elementStyle(group, INITIAL_SVG_STYLE, sheet);
		const style = elementStyle(root.querySelector('rect')!, groupStyle, sheet);
		expect(style[SvgProperty.Fill]).toBe('red');
		expect(style[SvgProperty.Stroke]).toBe('blue');
		expect(style[SvgProperty.StrokeWidth]).toBe('4');
		expect(style[SvgProperty.FontSize]).toBe('22');
		expect(style[SvgProperty.Opacity]).toBe('1');
		expect(elementStyle(group, { ...groupStyle, [SvgProperty.Opacity]: '0.2' }, sheet)[SvgProperty.Opacity]).toBe('0.5');
	});

	it('reads hex, rgb and keyword colours, with their alpha', () => {
		expect(parseColor('#F00')).toEqual({ color: '#ff0000', alpha: 1 });
		expect(parseColor('#00ff0080')!.alpha).toBeCloseTo(0.5, 2);
		expect(parseColor('rgb(0 0 255 / 50%)')).toEqual({ color: '#0000ff', alpha: 0.5 });
		expect(parseColor('rgba(100%, 0%, 0%, 0.25)')).toEqual({ color: '#ff0000', alpha: 0.25 });
		expect(parseColor('transparent')).toEqual({ color: '#000000', alpha: 0 });
		expect(parseColor('currentColor', '#123456')).toEqual({ color: '#123456', alpha: 1 });
		expect(parseColor('rgb(1)')).toBeNull();
		expect(parseColor('url(#a)')).toBeNull();
	});
});

describe('opening an SVG as editable layers', () => {
	it('is a transparent SVG document of the size the file asks for, scaled from its viewBox', async () => {
		const { document, objects } = await opened(svg('<rect x="10" y="10" width="20" height="10" fill="#ff0000"/>', 'viewBox="0 0 100 50" width="200"'));
		expect([document.width, document.height, document.documentType, document.baseName]).toEqual([200, 100, DocumentType.Svg, 'drawing']);
		expect(document.pixels.every((value) => value === 0)).toBe(true);
		expect((objects[0] as ShapeAnnotation).rect).toEqual({ x: 20, y: 20, width: 40, height: 20 });
	});

	it('makes rectangles and ellipses shapes, turned as the file turns them, a fill alone drawn without a line', async () => {
		const rect = await onlyItem<ShapeAnnotation>('<rect x="10" y="20" width="40" height="20" fill="#00ff00" transform="rotate(30 30 30)"/>');
		expect(rect).toMatchObject({ type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, fill: true, color: '#00ff00', width: 0 });
		expect(rect.rotation).toBeCloseTo(30);
		expect(rect.rect.x).toBeCloseTo(10);
		expect(rect.rect.width).toBeCloseTo(40);
		const circle = await onlyItem<ShapeAnnotation>('<circle cx="50" cy="50" r="10" fill="none" stroke="#0000ff" stroke-width="3" opacity="0.5"/>');
		expect(circle).toMatchObject({ shape: ShapeToolId.Ellipse, rect: { x: 40, y: 40, width: 20, height: 20 }, fill: false, color: '#0000ff', width: 3, opacity: 0.5 });
		const ellipse = await onlyItem<ShapeAnnotation>('<ellipse cx="50" cy="50" rx="20" ry="10" fill="#111111" stroke="#222222"/>');
		expect(ellipse).toMatchObject({ shape: ShapeToolId.Ellipse, fill: true, fillColor: '#111111', color: '#222222', width: 1 });
	});

	it('makes skewed, dashed and rounded rectangles paths, which can be all of those', async () => {
		const skewed = await onlyItem<PathAnnotation>('<rect width="10" height="10" transform="skewX(20)"/>');
		expect(skewed.type).toBe(AnnotationObjectTypeId.Path);
		const dashed = await onlyItem<PathAnnotation>('<rect width="10" height="10" fill="none" stroke="#000" stroke-dasharray="4 2"/>');
		expect(dashed).toMatchObject({ type: AnnotationObjectTypeId.Path, dash: LineDash.Dashed });
		const rounded = await onlyItem<PathAnnotation>('<rect width="40" height="20" rx="5"/>');
		expect(rounded.type).toBe(AnnotationObjectTypeId.Path);
		expect(rounded.contours[0]!.closed).toBe(true);
	});

	it('makes paths paths, with their fill rule, closing a filled outline-free path as SVG fills it', async () => {
		const path = await onlyItem<PathAnnotation>('<path d="M0 0 L10 0 L10 10" fill="#ff0000" fill-rule="evenodd" transform="translate(5 5)"/>');
		expect(path).toMatchObject({ fill: true, color: '#ff0000', fillRule: 'evenodd', width: 0 });
		expect(path.contours[0]!.closed).toBe(true);
		expect(path.contours[0]!.nodes[0]!.point).toEqual({ x: 5, y: 5 });
		const polygon = await onlyItem<PathAnnotation>('<polygon points="0,0 10,0 5,8" fill="none" stroke="#000"/>');
		expect(polygon).toMatchObject({ fill: false, contours: [{ closed: true }] });
	});

	it('lays gradients over items relative to their frames, from the box or the element\'s own units', async () => {
		const box = await onlyItem<ShapeAnnotation>(
			'<defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#ff0000"/><stop offset="100%" stop-color="#0000ff" stop-opacity="0.5"/></linearGradient></defs><rect x="10" y="10" width="40" height="20" fill="url(#g)"/>',
		);
		expect(box.fillGradient).toEqual({
			kind: GradientKind.Linear,
			stops: [
				{ offset: 0, color: '#ff0000' },
				{ offset: 1, color: 'rgba(0, 0, 255, 0.5)' },
			],
			start: { x: 0, y: 0 },
			end: { x: 0, y: 1 },
		});
		const linked = await onlyItem<PathAnnotation>(
			'<defs><radialGradient id="base"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><radialGradient id="g" href="#base" gradientUnits="userSpaceOnUse" cx="10" cy="10" r="10"/></defs><path d="M0 0H20V20H0Z" fill="none" stroke="url(#g)" stroke-width="2"/>',
		);
		expect(linked.lineGradient).toMatchObject({ kind: GradientKind.Radial, start: { x: 0.5, y: 0.5 }, end: { x: 1, y: 0.5 } });
		const single = await onlyItem<ShapeAnnotation>('<defs><linearGradient id="g"><stop stop-color="#abcdef"/></linearGradient></defs><rect width="5" height="5" fill="url(#g)"/>');
		expect(single).toMatchObject({ color: '#abcdef', fill: true });
		expect(single.fillGradient).toBeUndefined();
	});

	it('makes lines and polylines lines, their marker ends the editor\'s ends with hollow ends\' tips restored', async () => {
		const markers =
			'<defs><marker id="h" data-line-end="triangle"/><marker id="t" data-line-end="arrow"/></defs>';
		const line = await onlyItem<ConnectorAnnotation>(`${markers}<polyline points="0,0 50,0 50,40" fill="none" stroke="#333" stroke-width="2" marker-end="url(#h)" marker-start="url(#t)"/>`);
		expect(line).toMatchObject({ type: AnnotationObjectTypeId.Connector, head: LineEnd.Triangle, tail: LineEnd.Arrow, color: '#333333', width: 2, arrow: false });
		// A hollow triangle's line stops at its back, 10 short of the tip on a line 2 wide.
		expect(line.points.at(-1)).toEqual({ x: 50, y: 50 });
		expect(line.points[0]).toEqual({ x: 0, y: 0 });
		const plain = await onlyItem<ConnectorAnnotation>('<line x1="0" y1="0" x2="10" y2="10" stroke="#000"/>');
		expect(plain.head).toBeUndefined();
	});

	it('makes text text, placed by its anchor and its turn, a line for each placed span', async () => {
		const text = await onlyItem<TextAnnotation>('<text x="20" y="40" font-size="20" fill="#123456">  Hello   world </text>');
		expect(text).toMatchObject({ type: AnnotationObjectTypeId.Text, text: 'Hello world', at: { x: 20, y: 40 }, size: 20, color: '#123456' });
		const centred = await onlyItem<TextAnnotation>('<text x="100" y="40" font-size="10" text-anchor="middle">abcd</text>');
		expect(centred.at.x).toBeCloseTo(100 - (4 * 10 * 0.62) / 2);
		const turned = await onlyItem<TextAnnotation>('<text x="0" y="0" font-size="10" transform="rotate(90)">ab</text>');
		expect(turned.rotation).toBeCloseTo(90);
		const { objects } = await opened(svg('<text x="0" y="20" font-size="10" style="font: 700 16px serif">first<tspan x="0" y="40" fill="#ff0000">second</tspan></text>'));
		expect(objects.map((item) => [(item as TextAnnotation).text, (item as TextAnnotation).size, (item as TextAnnotation).color])).toEqual([
			['first', 16, 'black'],
			['second', 16, '#ff0000'],
		]);
	});

	it('makes each top-level group a layer, named, faded, blended and hidden as it is, and loose drawing a layer of its own', async () => {
		const { layers, objects } = await opened(
			svg(
				'<rect width="5" height="5"/><g id="layer-Background" opacity="0.5" style="mix-blend-mode: multiply"><rect width="5" height="5"/></g><g inkscape:label="Ink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" style="display:none"><circle r="3"/></g><g><title>Notes</title><g transform="translate(10 0)" opacity="0.5"><rect width="5" height="5" fill-opacity="0.5"/></g></g><g/>',
			),
		);
		expect(layers.map(({ name, visible, opacity, blendMode }) => [name, visible ?? true, opacity ?? 1, blendMode ?? BlendMode.Normal])).toEqual([
			['Layer 1', true, 1, BlendMode.Normal],
			['Background', true, 0.5, BlendMode.Multiply],
			['Ink', false, 1, BlendMode.Normal],
			['Notes', true, 1, BlendMode.Normal],
		]);
		expect(layers.map(({ itemIds }) => itemIds.length)).toEqual([1, 1, 1, 1]);
		const nested = objects.at(-1) as ShapeAnnotation;
		expect(nested.rect.x).toBe(10);
		expect(nested.opacity).toBeCloseTo(0.25);
	});

	it('keeps hidden parts hidden, and leaves out what draws nothing', async () => {
		const { objects } = await opened(svg('<rect width="5" height="5" visibility="hidden"/><rect width="5" height="5" display="none"/><rect width="0" height="5"/><path d="M0 0" fill="none" stroke="none"/>'));
		expect(objects).toHaveLength(1);
		expect(objects[0]!.visible).toBe(false);
	});

	it('keeps what no item can be as a picture of it, drawn as SVG draws it', async () => {
		// jsdom draws no pictures, so the parts kept as pictures are left out here; the browser tests draw them.
		const { objects } = await opened(
			svg('<rect width="5" height="5" filter="url(#f)"/><use href="#r"/><rect width="5" height="5" fill="url(#missing-pattern) none"/><rect width="5" height="5" fill="#000" stroke="#fff" fill-opacity="0.5"/><text font-size="10" stroke="#000">outlined</text>'),
		);
		expect(objects).toEqual([]);
	});
});

describe('an SVG written by the editor opened again', () => {
	beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA'));

	it('gives back the same layers and items, ready to edit', async () => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'round trip', width: 300, height: 200, transparent: true, background: '#ffffff' });
		const objects = new AnnotationDocument();
		objects.add({ id: 'box', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x: 10, y: 20, width: 80, height: 40 }, rotation: 15, color: '#333333', width: 3, opacity: 0.8, fill: true, fillGradient: linearGradient(['#ff0000', '#0000ff'], 90) });
		objects.add({ id: 'round', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Ellipse, rect: { x: 150, y: 20, width: 60, height: 30 }, color: '#1d4ed8', width: 2, opacity: 1, fill: false });
		objects.setLayerAppearance(objects.state.layers[0]!.id, { name: 'Shapes & things', opacity: 0.75, blendMode: BlendMode.Screen });
		objects.createLayer();
		objects.add({ id: 'curve', type: AnnotationObjectTypeId.Path, contours: parsePathData('M20 150 C 60 100 100 200 140 150'), color: '#12ab34', width: 4, opacity: 1, fill: false, dash: LineDash.Dashed, head: LineEnd.Arrow, tail: LineEnd.Circle });
		objects.add({ id: 'elbow', type: AnnotationObjectTypeId.Connector, points: [{ x: 160, y: 120 }, { x: 260, y: 120 }, { x: 260, y: 180 }], color: '#626977', width: 2, opacity: 1, arrow: false, dash: LineDash.Solid, head: LineEnd.Triangle, tail: LineEnd.FilledDiamond });
		objects.add({ id: 'note', type: AnnotationObjectTypeId.Text, at: { x: 30, y: 190 }, text: 'Hello <SVG>', color: '#17191e', size: 24, rotation: 10 });

		const { layers, objects: reopened } = await opened(svgDocument(model, objects.state));
		expect(layers.map(({ name, opacity, blendMode }) => [name, opacity, blendMode])).toEqual([
			['Shapes & things', 0.75, BlendMode.Screen],
			[objects.state.layers[1]!.name, undefined, undefined],
		]);
		const [box, round, curve, elbow, note] = reopened as [ShapeAnnotation, ShapeAnnotation, PathAnnotation, ConnectorAnnotation, TextAnnotation];
		expect(box).toMatchObject({ type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, color: '#333333', width: 3, fill: true });
		expect(box.opacity).toBeCloseTo(0.8);
		expect(box.rotation).toBeCloseTo(15);
		for (const [key, value] of Object.entries({ x: 10, y: 20, width: 80, height: 40 })) expect(box.rect[key as keyof typeof box.rect]).toBeCloseTo(value, 2);
		expect(box.fillGradient!.start.x).toBeCloseTo(0.5, 2);
		expect(box.fillGradient!.start.y).toBeCloseTo(0, 2);
		expect(box.fillGradient!.end.y).toBeCloseTo(1, 2);
		expect(round).toMatchObject({ shape: ShapeToolId.Ellipse, rect: { x: 150, y: 20, width: 60, height: 30 }, fill: false, color: '#1d4ed8', width: 2 });
		expect(curve).toMatchObject({ type: AnnotationObjectTypeId.Path, color: '#12ab34', width: 4, dash: LineDash.Dashed, head: LineEnd.Arrow, tail: LineEnd.Circle });
		expect(curve.contours[0]!.nodes.map(({ point }) => point)).toEqual([
			{ x: 20, y: 150 },
			{ x: 140, y: 150 },
		]);
		expect(elbow).toMatchObject({ type: AnnotationObjectTypeId.Connector, head: LineEnd.Triangle, tail: LineEnd.FilledDiamond, color: '#626977', width: 2 });
		elbow.points.forEach((point, index) => {
			expect(point.x).toBeCloseTo([160, 260, 260][index]!, 2);
			expect(point.y).toBeCloseTo([120, 120, 180][index]!, 2);
		});
		expect(note).toMatchObject({ type: AnnotationObjectTypeId.Text, text: 'Hello <SVG>', color: '#17191e', size: 24 });
		expect(note.rotation).toBeCloseTo(10);
		expect(note.at.x).toBeCloseTo(30, 2);
		expect(note.at.y).toBeCloseTo(190, 2);
	});
});
