import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../../core/document/appTypes';
import { linearGradient, radialGradient } from '../../../core/geometry/gradient';
import { encodePixelBytes } from '../../../shared/image/pixelDataCodec';
import { type AnnotationObject, AnnotationObjectTypeId, type AnnotationObjectType, LineDash, type ShapeAnnotation } from '../../annotations/annotationTypes';
import { type AnimItem, AnimItemKind, FontStyle, PaintKind, PathCommandName } from './animationSchema';
import { decomposedTransform, fileContours, fileFont, fileItem } from './itemConversion';

const SIZE = 100;
const RGBA_CHANNELS = 4;

/** One of every kind of editor item; the table is keyed by item type, so a new kind does not compile until it is here. */
const ITEMS: Readonly<Record<AnnotationObjectType, AnnotationObject>> = {
	[AnnotationObjectTypeId.Arrow]: { id: 'arrow', type: AnnotationObjectTypeId.Arrow, from: { x: 0, y: 0 }, to: { x: 40, y: 20 }, color: '#ff0000', width: 3 },
	[AnnotationObjectTypeId.Step]: { id: 'step', type: AnnotationObjectTypeId.Step, at: { x: 20, y: 20 }, value: 1, color: '#ff0000', size: 24 },
	[AnnotationObjectTypeId.Box]: { id: 'box', type: AnnotationObjectTypeId.Box, rect: { x: 0, y: 0, width: 40, height: 20 }, color: '#ff0000', width: 2, opacity: 1, blur: 0 },
	[AnnotationObjectTypeId.Highlight]: { id: 'highlight', type: AnnotationObjectTypeId.Highlight, rect: { x: 0, y: 0, width: 40, height: 20 }, color: '#ffff00', width: 2, opacity: 0.4, blur: 0 },
	[AnnotationObjectTypeId.Text]: { id: 'text', type: AnnotationObjectTypeId.Text, at: { x: 0, y: 20 }, text: 'Hi', color: '#000000', size: 16 },
	[AnnotationObjectTypeId.Blur]: { id: 'blur', type: AnnotationObjectTypeId.Blur, rect: { x: 0, y: 0, width: 40, height: 20 }, color: '#000000', width: 1, opacity: 1, blur: 8 },
	[AnnotationObjectTypeId.Redact]: { id: 'redact', type: AnnotationObjectTypeId.Redact, rect: { x: 0, y: 0, width: 40, height: 20 }, color: '#000000', width: 1, opacity: 1, blur: 0 },
	[AnnotationObjectTypeId.Shape]: { id: 'shape', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Star, rect: { x: 0, y: 0, width: 40, height: 40 }, color: '#000000', width: 2, opacity: 1, fill: true },
	[AnnotationObjectTypeId.Stroke]: {
		id: 'stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: 'objects',
		tool: PaintToolId.Pencil,
		points: [
			{ x: 0, y: 0, pressure: 1 },
			{ x: 30, y: 10, pressure: 1 },
		],
		rect: { x: 0, y: 0, width: 30, height: 10 },
		color: '#000000',
		size: 3,
		opacity: 1,
		hardness: 1,
		seed: 1,
	},
	[AnnotationObjectTypeId.Fill]: {
		id: 'fill',
		type: AnnotationObjectTypeId.Fill,
		layerId: 'objects',
		rect: { x: 0, y: 0, width: 4, height: 2 },
		runs: [
			{ x: 0, y: 0, length: 4 },
			{ x: 0, y: 1, length: 4 },
		],
		color: '#00ff00',
		opacity: 1,
		tolerance: 0,
	},
	[AnnotationObjectTypeId.RasterFragment]: {
		id: 'raster',
		type: AnnotationObjectTypeId.RasterFragment,
		rect: { x: 0, y: 0, width: 4, height: 4 },
		pixelWidth: 4,
		pixelHeight: 4,
		pixels: encodePixelBytes(new Uint8ClampedArray(4 * 4 * RGBA_CHANNELS).fill(255)),
		rotation: 0,
	},
	[AnnotationObjectTypeId.Connector]: {
		id: 'connector',
		type: AnnotationObjectTypeId.Connector,
		points: [
			{ x: 0, y: 0 },
			{ x: 30, y: 0 },
			{ x: 30, y: 30 },
		],
		color: '#000000',
		width: 2,
		opacity: 1,
		arrow: true,
		dash: LineDash.Dashed,
	},
	[AnnotationObjectTypeId.Path]: {
		id: 'path',
		type: AnnotationObjectTypeId.Path,
		contours: [{ closed: true, nodes: [{ point: { x: 0, y: 0 } }, { point: { x: 20, y: 0 } }, { point: { x: 10, y: 20 } }] }],
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		fillColor: '#ff00ff',
		dash: LineDash.Solid,
	},
};

/** What each kind of item is written as, as `docs/animation-format.md` §7 lists. */
const WRITTEN_AS: Readonly<Record<AnnotationObjectType, string>> = {
	[AnnotationObjectTypeId.Arrow]: 'group[path,path]',
	[AnnotationObjectTypeId.Step]: 'group[path,text]',
	[AnnotationObjectTypeId.Box]: 'path',
	[AnnotationObjectTypeId.Highlight]: 'path',
	[AnnotationObjectTypeId.Text]: 'group[text]',
	[AnnotationObjectTypeId.Blur]: 'group[image]',
	[AnnotationObjectTypeId.Redact]: 'path',
	[AnnotationObjectTypeId.Shape]: 'path',
	[AnnotationObjectTypeId.Stroke]: 'path',
	[AnnotationObjectTypeId.Fill]: 'path',
	[AnnotationObjectTypeId.RasterFragment]: 'image',
	[AnnotationObjectTypeId.Connector]: 'group[path,path]',
	[AnnotationObjectTypeId.Path]: 'path',
};

function stage() {
	const canvas = document.createElement('canvas');
	canvas.width = SIZE;
	canvas.height = SIZE;
	return { canvas, width: SIZE, height: SIZE };
}

function written(item: AnimItem): string {
	return item.kind === AnimItemKind.Group ? `group[${item.items.map(written).join(',')}]` : item.kind;
}

function convert(item: AnnotationObject): AnimItem {
	return fileItem(item, stage(), 'editing data');
}

describe('editor items as file items', () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
	});

	it.each(Object.keys(ITEMS) as AnnotationObjectType[])('writes a %s as the spec says', (type) => {
		const item = convert(ITEMS[type]);
		expect(written(item)).toBe(WRITTEN_AS[type]);
		expect(item.id).toBe(ITEMS[type].id);
		expect(item.editor).toBe('editing data');
	});

	it('bakes what the format cannot say into the picture it draws', () => {
		const soft = { ...ITEMS[AnnotationObjectTypeId.Stroke], hardness: 0.5, tool: PaintToolId.Brush } as AnnotationObject;
		const shadowed: ShapeAnnotation = { ...(ITEMS[AnnotationObjectTypeId.Shape] as ShapeAnnotation), effects: { shadow: { color: '#000000', opacity: 0.5, offset: { x: 2, y: 2 }, softness: 2 } } };
		for (const item of [soft, shadowed]) expect(written(convert(item))).toBe('group[image]');
	});

	it('places the item by its pivot and turn, its content in its own frame', () => {
		const shape: ShapeAnnotation = { ...(ITEMS[AnnotationObjectTypeId.Shape] as ShapeAnnotation), rect: { x: 10, y: 20, width: 40, height: 30 }, rotation: 180, pivot: { x: 0, y: 0 } };
		const item = convert(shape);
		expect(item.frame).toEqual({ width: 40, height: 30 });
		expect(item.transform.rotation).toBeCloseTo(Math.PI, 6);
		expect(item.transform.pivot).toEqual({ x: 0, y: 0 });
		// The top-left corner, turned half a turn about the centre (30, 35), lies at (50, 50).
		expect(item.transform.x).toBeCloseTo(50, 6);
		expect(item.transform.y).toBeCloseTo(50, 6);
	});

	it('keeps solid, linear and centred radial paints, and line styles', () => {
		const shape = ITEMS[AnnotationObjectTypeId.Shape] as ShapeAnnotation;
		const linear = convert({ ...shape, fillGradient: linearGradient(['#ff0000', '#0000ff']) });
		expect(linear.kind === AnimItemKind.Path && linear.fill?.kind).toBe(PaintKind.Linear);
		const radial = convert({ ...shape, fillGradient: radialGradient(['#ff0000', '#0000ff']) });
		expect(radial.kind === AnimItemKind.Path && radial.fill?.kind).toBe(PaintKind.Radial);
		const connector = convert(ITEMS[AnnotationObjectTypeId.Connector]);
		const line = connector.kind === AnimItemKind.Group ? connector.items[0] : undefined;
		expect(line?.kind === AnimItemKind.Path && line.stroke?.dash.length).toBeGreaterThan(0);
	});
});

describe('conversion helpers', () => {
	it('reads canvas fonts', () => {
		expect(fileFont('16px sans-serif')).toEqual({ family: 'sans-serif', size: 16, weight: 400, style: FontStyle.Normal });
		expect(fileFont('italic bold 12.5px "Inter", serif')).toEqual({ family: 'Inter", serif', size: 12.5, weight: 700, style: FontStyle.Italic });
		expect(fileFont('normal 600 10px/1.2 Arial')).toEqual({ family: 'Arial', size: 10, weight: 600, style: FontStyle.Normal });
		expect(fileFont('large serif')).toBeNull();
	});

	it('takes a matrix apart into a transform, refusing mirrored ones', () => {
		expect(decomposedTransform([2, 0, 1, 0.5, 20, 20])).toEqual({ x: 20, y: 20, rotation: 0, scaleX: 2, scaleY: 0.5, skewX: Math.atan(2), pivot: { x: 0, y: 0 } });
		expect(decomposedTransform([1, 0, 0, -1, 0, 0])).toBeNull();
		expect(decomposedTransform([0, 0, 0, 1, 0, 0])).toBeNull();
	});

	it('writes path data as commands, arcs as cubic curves, mapped by the matrix', () => {
		const [square] = fileContours('M0 0L10 0L10 10Z', [1, 0, 0, 1, 5, 5]);
		expect(square!.commands).toEqual([
			[PathCommandName.Move, 5, 5],
			[PathCommandName.Line, 15, 5],
			[PathCommandName.Line, 15, 15],
			[PathCommandName.Line, 5, 5],
			[PathCommandName.Close],
		]);
		const [arc] = fileContours('M10 0A10 10 0 0 1 0 10', [1, 0, 0, 1, 0, 0]);
		expect(arc!.commands.slice(1).every((command) => command[0] === PathCommandName.Cubic)).toBe(true);
		expect(fileContours('', [1, 0, 0, 1, 0, 0])).toBeNull();
	});
});
