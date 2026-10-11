import { describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { drawPatternTile, isFillPattern, PatternKind, type PatternPainter, patternOf } from '../../core/geometry/fillPattern';
import { parsePathData } from '../../core/geometry/vectorPath';
import { isAnnotationSessionState } from './annotationSerialization';
import { renderAnnotationObject } from './annotationRenderer';
import { AnnotationObjectTypeId, type ShapeAnnotation } from './annotationTypes';
import { EffectPropertyId, editableEffects, setEffectProperty } from './editableEffects';
import { EditableObjectPropertyId, editableObjectProperties, FillStyle, setEditableObjectProperty } from './editableObjectProperties';
import { clipContours, clipFor, isOptionalItemClip } from './itemClip';
import { changedEffects, DEFAULT_SHADOW, effectFilter, effectMargin, isOptionalItemEffects, takesEffects, withShadowDistance } from './itemEffects';
import { patternOfTile, patternPaint } from './patternPaint';

const BOX: ShapeAnnotation = {
	id: 'box',
	type: AnnotationObjectTypeId.Shape,
	shape: ShapeToolId.Rectangle,
	rect: { x: 10, y: 20, width: 100, height: 50 },
	color: '#333333',
	width: 2,
	opacity: 1,
	fill: true,
};

const box = (changes: Partial<ShapeAnnotation> = {}): ShapeAnnotation => ({ ...structuredClone(BOX), ...changes });

function painter(): PatternPainter & { calls: string[] } {
	const calls: string[] = [];
	const record = (name: string) => (...args: unknown[]) => void calls.push(`${name}(${args.join(',')})`);
	return {
		calls,
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 1,
		beginPath: record('beginPath'),
		moveTo: record('moveTo'),
		lineTo: record('lineTo'),
		arc: record('arc'),
		fill: record('fill'),
		stroke: record('stroke'),
		fillRect: record('fillRect'),
	};
}

describe('pattern fills', () => {
	it('draw each kind of tile so tiles meet, over a background when there is one', () => {
		const stripes = painter();
		drawPatternTile(stripes, patternOf(PatternKind.Stripes, '#ff0000', '#ffffff', 8));
		expect(stripes.calls[0]).toBe('fillRect(0,0,8,8)');
		expect(stripes.calls.filter((call) => call.startsWith('moveTo'))).toHaveLength(3);
		expect([stripes.fillStyle, stripes.lineWidth]).toEqual(['#ff0000', 2]);
		const dots = painter();
		drawPatternTile(dots, patternOf(PatternKind.Dots, '#000000'));
		expect(dots.calls).toEqual(['beginPath()', `arc(6,6,${12 / 5},0,${Math.PI * 2})`, 'fill()']);
		const grid = painter();
		drawPatternTile(grid, patternOf(PatternKind.Grid, '#000000', undefined, 16));
		expect(grid.calls).toEqual(['fillRect(0,0,16,2)', 'fillRect(0,0,2,16)']);
		const checks = painter();
		drawPatternTile(checks, patternOf(PatternKind.Checks, '#000000', undefined, 10));
		expect(checks.calls).toEqual(['fillRect(0,0,5,5)', 'fillRect(5,5,5,5)']);
	});

	it('are read from files only when whole and within their sizes', () => {
		expect(isFillPattern(patternOf(PatternKind.Grid, '#000000'))).toBe(true);
		expect(isFillPattern({ kind: 'plaid', color: '#000000', size: 12 })).toBe(false);
		expect(isFillPattern({ kind: PatternKind.Grid, color: '#000000', size: 1000 })).toBe(false);
		expect(isFillPattern({ kind: PatternKind.Grid, color: '#000000', background: 3, size: 12 })).toBe(false);
		expect(isFillPattern(null)).toBe(false);
	});

	it('paint from the item\'s frame, from one tile that remembers its pattern', () => {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;
		const pattern = patternOf(PatternKind.Dots, '#123456', undefined, 9.6);
		const paint = patternPaint(context, pattern, { x: 5, y: 7, width: 10, height: 10 });
		expect(paint!.setTransform).toHaveBeenCalledWith({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 7 });
		const [tile] = vi.mocked(context.createPattern).mock.calls[0]!;
		expect(patternOfTile(tile)).toEqual({ ...pattern, size: 10 });
		patternPaint(context, pattern, { x: 0, y: 0, width: 1, height: 1 });
		expect(vi.mocked(context.createPattern).mock.calls[1]![0]).toBe(tile);
		expect(patternOfTile('not a tile')).toBeUndefined();
	});

	it('are a fill style, which keeps the fill\'s colours and remembers its tile size', () => {
		const item = box({ fillColor: '#ff0000' });
		setEditableObjectProperty(item, EditableObjectPropertyId.FillStyle, FillStyle.Stripes);
		expect(item.fillPattern).toEqual(patternOf(PatternKind.Stripes, '#ff0000', '#ffffff', 12));
		expect(editableObjectProperties(item)).toMatchObject({ fillStyle: FillStyle.Stripes, fillColor: '#ff0000', fillColorEnd: '#ffffff', patternSize: 12 });
		setEditableObjectProperty(item, EditableObjectPropertyId.FillColor, '#00ff00');
		setEditableObjectProperty(item, EditableObjectPropertyId.FillColorEnd, '#0000ff');
		setEditableObjectProperty(item, EditableObjectPropertyId.PatternSize, 200);
		expect(item.fillPattern).toEqual({ kind: PatternKind.Stripes, color: '#00ff00', background: '#0000ff', size: 64 });
		setEditableObjectProperty(item, EditableObjectPropertyId.FillStyle, FillStyle.Dots);
		expect(item.fillPattern).toMatchObject({ kind: PatternKind.Dots, size: 64 });
		setEditableObjectProperty(item, EditableObjectPropertyId.FillStyle, FillStyle.Linear);
		expect(item.fillPattern).toBeUndefined();
		expect(item.fillGradient!.stops.map(({ color }) => color)).toEqual(['#00ff00', '#0000ff']);
		setEditableObjectProperty(item, EditableObjectPropertyId.FillStyle, FillStyle.Checks);
		expect(item.fillPattern).toEqual(patternOf(PatternKind.Checks, '#00ff00', '#0000ff', 12));
		setEditableObjectProperty(item, EditableObjectPropertyId.FillStyle, FillStyle.Solid);
		expect([item.fillPattern, item.fillColor]).toEqual([undefined, '#00ff00']);
		const imported = box({ fillPattern: patternOf(PatternKind.Grid, '#000000') });
		expect(editableObjectProperties(imported).fillColorEnd).toBeUndefined();
	});
});

describe('item effects', () => {
	it('are a canvas filter: the blur first, then the shadow of what it blurred', () => {
		expect(effectFilter({ blur: 3 })).toBe('blur(3px)');
		expect(effectFilter({ shadow: DEFAULT_SHADOW })).toBe('drop-shadow(6px 6px 8px rgba(0, 0, 0, 0.35))');
		expect(effectFilter({ blur: 2, shadow: { ...DEFAULT_SHADOW, opacity: 1 } })).toBe('blur(2px) drop-shadow(6px 6px 8px #000000)');
	});

	it('reach beyond their item by their spread and their shadow\'s fall', () => {
		expect(effectMargin(undefined)).toBe(0);
		expect(effectMargin({ blur: 0 })).toBe(0);
		expect(effectMargin({ blur: 2, shadow: { ...DEFAULT_SHADOW, offset: { x: 3, y: 4 }, softness: 1 } })).toBe(6 + 5 + 3);
	});

	it('keep no empty record, and a shadow keeps its direction as its distance changes', () => {
		expect(changedEffects({ blur: 2 }, { blur: 0 })).toBeUndefined();
		expect(changedEffects(undefined, { shadow: DEFAULT_SHADOW })).toEqual({ shadow: DEFAULT_SHADOW });
		const farther = withShadowDistance({ ...DEFAULT_SHADOW, offset: { x: 0, y: -2 } }, 10);
		expect(farther.offset.x).toBeCloseTo(0);
		expect(farther.offset.y).toBeCloseTo(-10);
		const fresh = withShadowDistance({ ...DEFAULT_SHADOW, offset: { x: 0, y: 0 } }, Math.SQRT2);
		expect(fresh.offset.x).toBeCloseTo(1);
		expect(fresh.offset.y).toBeCloseTo(1);
	});

	it('are properties of their own, set within their ranges, on every item but a blur', () => {
		const item = box();
		expect(editableEffects(item)).toEqual({ blur: 0, shadow: false });
		setEffectProperty(item, EffectPropertyId.ShadowDistance, 20);
		expect(item.effects).toBeUndefined();
		setEffectProperty(item, EffectPropertyId.Shadow, true);
		setEffectProperty(item, EffectPropertyId.ShadowColor, '#ff0000');
		setEffectProperty(item, EffectPropertyId.ShadowDistance, 500);
		setEffectProperty(item, EffectPropertyId.ShadowSoftness, -3);
		setEffectProperty(item, EffectPropertyId.Blur, 5);
		expect(editableEffects(item)).toEqual({ blur: 5, shadow: true, shadowColor: '#ff0000', shadowDistance: 80, shadowSoftness: 0 });
		setEffectProperty(item, EffectPropertyId.Shadow, false);
		setEffectProperty(item, EffectPropertyId.Blur, 0);
		expect(item.effects).toBeUndefined();
		setEffectProperty(item, EffectPropertyId.Blur, 'loud');
		setEffectProperty(item, EffectPropertyId.Shadow, 3);
		expect(item.effects).toBeUndefined();
		const blur = { id: 'b', type: AnnotationObjectTypeId.Blur, rect: BOX.rect, blur: 4 } as const;
		expect(takesEffects(blur)).toBe(false);
		expect(editableEffects(blur as never)).toBeNull();
		setEffectProperty(blur as never, EffectPropertyId.Blur, 3);
		expect('effects' in blur).toBe(false);
	});

	it('are drawn through a filter once, from the item drawn whole on its own', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 50;
		canvas.height = 40;
		const context = canvas.getContext('2d')!;
		renderAnnotationObject(context, canvas, box({ effects: { blur: 3 } }));
		expect(context.filter).toBe('blur(3px)');
		expect(context.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0);
		renderAnnotationObject(context, canvas, box({ effects: { blur: 1 } }));
		expect(context.filter).toBe('blur(1px)');
	});
});

describe('item clips', () => {
	const turned = box({ rotation: 90 });
	const square = parsePathData('M60 30 L80 30 L80 50 L60 50 Z');

	it('are kept relative to the item, turned with it, and give back the outline they were made from', () => {
		const clip = clipFor(turned, square);
		const back = clipContours(turned, clip)[0]!.nodes.map(({ point }) => point);
		square[0]!.nodes.forEach(({ point }, index) => {
			expect(back[index]!.x).toBeCloseTo(point.x);
			expect(back[index]!.y).toBeCloseTo(point.y);
		});
		const moved = clipContours({ ...turned, rect: { ...turned.rect, x: turned.rect.x + 10 } }, clip)[0]!.nodes[0]!.point;
		expect(moved.x).toBeCloseTo(70);
		expect(clipFor(BOX, square, 'evenodd').fillRule).toBe('evenodd');
	});

	it('are drawn as a canvas clip around the item', () => {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;
		renderAnnotationObject(context, canvas, box({ clip: clipFor(BOX, square) }));
		expect(context.clip).toHaveBeenCalledWith('nonzero');
	});

	it('are read from files only when they hold contours', () => {
		expect(isOptionalItemClip(undefined)).toBe(true);
		expect(isOptionalItemClip(clipFor(BOX, square, 'evenodd'))).toBe(true);
		expect(isOptionalItemClip({ contours: [] })).toBe(false);
		expect(isOptionalItemClip({ contours: [{ closed: true, nodes: [{ point: { x: 'a', y: 0 } }] }] })).toBe(false);
		expect(isOptionalItemClip({ contours: square, fillRule: 'wavy' })).toBe(false);
		expect(isOptionalItemClip(4)).toBe(false);
	});
});

describe('a project with effects, clips and patterns', () => {
	const session = (item: unknown) => {
		const state = { objects: [item], layers: [{ id: 'l', name: 'Layer 1', itemIds: ['box'] }], nextStep: 1 };
		return { state, history: [state], historyIndex: 0 };
	};

	it('is read when they are whole, and refused when they are not', () => {
		const good = box({ effects: { blur: 2, shadow: DEFAULT_SHADOW }, clip: clipFor(BOX, square()), fillPattern: patternOf(PatternKind.Grid, '#000000') });
		expect(isAnnotationSessionState(session(good))).toBe(true);
		expect(isOptionalItemEffects({ blur: -1 })).toBe(false);
		expect(isOptionalItemEffects({ shadow: { ...DEFAULT_SHADOW, opacity: 2 } })).toBe(false);
		expect(isOptionalItemEffects({ shadow: { ...DEFAULT_SHADOW, offset: null } })).toBe(false);
		expect(isOptionalItemEffects('blur')).toBe(false);
		expect(isAnnotationSessionState(session({ ...good, effects: { blur: 'x' } }))).toBe(false);
		expect(isAnnotationSessionState(session({ ...good, clip: { contours: [] } }))).toBe(false);
		expect(isAnnotationSessionState(session({ ...good, fillPattern: { kind: 'plaid' } }))).toBe(false);
	});

	function square() {
		return parsePathData('M0 0H10V10H0Z');
	}
});
