import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PatternKind, patternOf } from '../../core/geometry/fillPattern';
import { parsePathData } from '../../core/geometry/vectorPath';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { clipContours, clipFor } from '../annotations/itemClip';
import { DEFAULT_SHADOW } from '../annotations/itemEffects';
import { svgDocument } from './svgExport';
import { importSvg } from './svgImport';

const BOX: ShapeAnnotation = {
	id: 'box',
	type: AnnotationObjectTypeId.Shape,
	shape: ShapeToolId.Rectangle,
	rect: { x: 20, y: 20, width: 100, height: 60 },
	color: '#333333',
	width: 2,
	opacity: 1,
	fill: true,
};

const svg = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">${content}</svg>`;
const opened = async (markup: string) => (await importSvg(markup, 'looks')).editableObjects.state.objects;

describe('effects, clips and patterns in an SVG written by the editor', () => {
	let model: CanvasDocument;
	beforeEach(() => {
		model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		model.create({ name: 'looks', width: 200, height: 100, transparent: true, background: '#ffffff' });
		vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
	});

	it('are a standard filter, clipPath and pattern, and open again the same', async () => {
		const objects = new AnnotationDocument();
		const clip = clipFor(BOX, parsePathData('M30 30H90V70H30Z'), 'evenodd');
		const shadow = { ...DEFAULT_SHADOW, color: '#112233' };
		objects.add({ ...BOX, effects: { blur: 2, shadow }, clip, fillPattern: patternOf(PatternKind.Stripes, '#ff0000', '#ffffff', 10) });
		const markup = svgDocument(model, objects.state);
		const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
		const filter = root.querySelector('filter')!;
		expect([...filter.children].map(({ localName }) => localName)).toEqual(['feGaussianBlur', 'feDropShadow']);
		expect(filter.querySelector('feDropShadow')!.getAttribute('in')).toBe('blurred');
		expect(root.querySelector('clipPath path')!.getAttribute('clip-rule')).toBe('evenodd');
		const pattern = root.querySelector('pattern')!;
		expect([pattern.getAttribute('data-pattern'), pattern.getAttribute('data-pattern-color'), pattern.getAttribute('width')]).toEqual(['stripes', '#ff0000', '10']);
		expect(pattern.querySelectorAll('path, rect').length).toBeGreaterThan(0);
		expect(root.querySelector('g[filter] > g[clip-path] > rect')!.getAttribute('fill')).toBe(`url(#${pattern.id})`);

		const [item] = (await opened(markup)) as [ShapeAnnotation];
		expect(item.effects!.blur).toBeCloseTo(2);
		expect(item.effects!.shadow).toMatchObject({ color: '#112233', opacity: 0.35, softness: 4 });
		expect(item.effects!.shadow!.offset.x).toBeCloseTo(6);
		expect(item.fillPattern).toEqual(patternOf(PatternKind.Stripes, '#ff0000', '#ffffff', 10));
		expect(item.clip!.fillRule).toBe('evenodd');
		const xs = clipContours(item, item.clip!).flatMap(({ nodes }) => nodes.map(({ point }) => point.x));
		expect([Math.min(...xs), Math.max(...xs)]).toEqual([30, 90]);
	});

	it('write a shadow alone from the item itself', () => {
		const objects = new AnnotationDocument();
		objects.add({ ...BOX, effects: { shadow: DEFAULT_SHADOW } });
		const root = new DOMParser().parseFromString(svgDocument(model, objects.state), 'image/svg+xml').documentElement;
		expect([...root.querySelector('filter')!.children].map((step) => [step.localName, step.getAttribute('in')])).toEqual([['feDropShadow', 'SourceGraphic']]);
	});
});

describe('filters and clips in SVGs from elsewhere', () => {
	it('carry blurs and shadows onto items scaled and turned with them, and give a group\'s filter to each of its items', async () => {
		const items = await opened(
			svg(
				'<defs><filter id="s"><feDropShadow dx="2" dy="0" flood-color="#ff0000" flood-opacity="0.5"/></filter><filter id="b"><feGaussianBlur stdDeviation="1.5"/></filter></defs>' +
					'<g transform="rotate(90) scale(2)" filter="url(#s)"><rect width="5" height="5"/><circle r="2"/></g><rect width="5" height="5" filter="url(#b)"/>',
			),
		);
		expect(items).toHaveLength(3);
		const shadow = items[0]!.effects!.shadow!;
		expect([shadow.color, shadow.opacity, shadow.softness]).toEqual(['#ff0000', 0.5, 4]);
		expect(shadow.offset.x).toBeCloseTo(0);
		expect(shadow.offset.y).toBeCloseTo(4);
		expect(items[1]!.effects).toEqual(items[0]!.effects);
		expect(items[2]!.effects).toEqual({ blur: 1.5 });
	});

	it('clip items with a clipPath of shapes, transformed and filled by its rule', async () => {
		const [item] = await opened(
			svg('<defs><clipPath id="c"><circle cx="10" cy="10" r="5" clip-rule="evenodd"/><rect x="20" y="0" width="4" height="4" transform="translate(1 1)"/></clipPath></defs><rect width="40" height="20" clip-path="url(#c)"/>'),
		);
		expect(item!.clip!.fillRule).toBe('evenodd');
		const xs = clipContours(item!, item!.clip!).flatMap(({ nodes }) => nodes.map(({ point }) => point.x));
		expect(Math.min(...xs)).toBeCloseTo(5);
		expect(Math.max(...xs)).toBeCloseTo(25);
	});

	it('keep as pictures what no item can be: masks, other filters, other clips, other patterns and patterned lines', async () => {
		// jsdom draws no pictures, so the parts kept as pictures are left out here.
		const items = await opened(
			svg(
				'<defs>' +
					'<filter id="m"><feColorMatrix type="saturate" values="0"/></filter>' +
					'<filter id="u"><feGaussianBlur stdDeviation="1 3"/></filter>' +
					'<filter id="two"><feGaussianBlur stdDeviation="1"/><feDropShadow in="other"/></filter>' +
					'<filter id="many"><feGaussianBlur/><feDropShadow/><feOffset/></filter>' +
					'<clipPath id="t"><text>no</text></clipPath>' +
					'<clipPath id="box" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath>' +
					'<pattern id="p" width="4" height="4"><rect width="2" height="2"/></pattern>' +
					'<pattern id="ours" width="6" height="6" data-pattern="dots" data-pattern-color="#000000"/>' +
					'<mask id="k"><rect width="9" height="9" fill="#fff"/></mask>' +
					'</defs>' +
					'<rect width="5" height="5" filter="url(#m)"/><rect width="5" height="5" filter="url(#u)"/><rect width="5" height="5" filter="url(#two)"/><rect width="5" height="5" filter="url(#many)"/>' +
					'<rect width="5" height="5" filter="url(#missing)"/><rect width="5" height="5" clip-path="url(#t)"/><rect width="5" height="5" clip-path="url(#box)"/>' +
					'<rect width="5" height="5" fill="url(#p)"/><rect width="5" height="5" fill="none" stroke="url(#ours)"/><rect width="5" height="5" mask="url(#k)"/>' +
					'<g filter="url(#b2)"><use href="#x"/></g>',
			),
		);
		expect(items).toEqual([]);
	});

	it('give an item with a look of its own no second one from its group, which is kept as a picture', async () => {
		const items = await opened(
			svg('<defs><filter id="b"><feGaussianBlur stdDeviation="1"/></filter></defs><g filter="url(#b)"><rect width="5" height="5" filter="url(#b)"/></g><g filter="url(#b)"/>'),
		);
		expect(items).toEqual([]);
	});
});
