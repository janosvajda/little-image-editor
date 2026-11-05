import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { GradientKind, linearGradient } from '../../core/geometry/gradient';
import { genericShape } from '../../core/geometry/genericShape';
import { AnnotationObjectTypeId, type ShapeAnnotation, type TextAnnotation } from '../annotations/annotationTypes';
import { Ease, type EaseSpec, type MotionTween, RotateDirection, TweenKind } from './animationTypes';
import { lerpCssColor, lerpGradient } from './colorInterpolation';
import { BEZIER_TOLERANCE, cubicBezierProgress, easeProgress } from './easing';
import { itemPivotPoint } from './itemPivot';
import { interpolateItem, rotationDelta, tweenProgress } from './motionTween';

const PRECISION = 6;

function shape(overrides: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id: 'box',
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 0, y: 0, width: 10, height: 10 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		...overrides,
	};
}

function motion(overrides: Partial<MotionTween> = {}): MotionTween {
	return { kind: TweenKind.Motion, ease: { kind: Ease.Linear }, rotate: RotateDirection.Auto, extraTurns: 0, ...overrides };
}

describe('eases', () => {
	const cases: ReadonlyArray<readonly [EaseSpec, number, number]> = [
		[{ kind: Ease.Linear }, 0.25, 0.25],
		[{ kind: Ease.EaseIn }, 0.5, 0.25],
		[{ kind: Ease.EaseIn }, 0.25, 0.0625],
		[{ kind: Ease.EaseOut }, 0.5, 0.75],
		[{ kind: Ease.EaseOut }, 0.25, 0.4375],
		[{ kind: Ease.EaseInOut }, 0.25, 0.125],
		[{ kind: Ease.EaseInOut }, 0.5, 0.5],
		[{ kind: Ease.EaseInOut }, 0.75, 0.875],
		[{ kind: Ease.Custom, points: [0, 0, 1, 1] }, 0.3, 0.3],
		[{ kind: Ease.Custom, points: [0.25, 0.1, 0.25, 1] }, 0.5, 0.8024033877399112],
		[{ kind: Ease.Custom, points: [0.42, 0, 0.58, 1] }, 0.5, 0.5],
	];

	it.each(cases)('%o at %d is %d', (ease, t, expected) => {
		expect(easeProgress(ease, t)).toBeCloseTo(expected, PRECISION);
	});

	it('starts at 0 and ends at 1 for every ease, clamping progress outside 0..1', () => {
		for (const ease of [Ease.Linear, Ease.EaseIn, Ease.EaseOut, Ease.EaseInOut] as const) {
			expect(easeProgress({ kind: ease }, 0)).toBe(0);
			expect(easeProgress({ kind: ease }, 1)).toBe(1);
			expect(easeProgress({ kind: ease }, -1)).toBe(0);
			expect(easeProgress({ kind: ease }, 2)).toBe(1);
		}
		expect(cubicBezierProgress([0.3, 2, 0.7, -1], 0)).toBe(0);
		expect(cubicBezierProgress([0.3, 2, 0.7, -1], 1)).toBe(1);
	});

	it('solves a custom curve to its tolerance, falling back to bisection where Newton steps stall', () => {
		// A flat start makes the Newton slope vanish near 0, so bisection has to finish the solve.
		const steep: readonly [number, number, number, number] = [1, 0, 1, 1];
		const value = cubicBezierProgress(steep, 0.01);
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThan(BEZIER_TOLERANCE * 1e6);
		expect(cubicBezierProgress([0, 0, 0, 1], 0.5)).toBeGreaterThan(0.5);
		// x = 1 − (1 − s)³ flattens out at its end, where the Newton slope vanishes and bisection solves it.
		const nearEnd = 0.99999;
		const flatEnd = cubicBezierProgress([1, 0, 1, 1], nearEnd);
		const parameter = 1 - Math.cbrt(1 - nearEnd);
		expect(flatEnd).toBeCloseTo(3 * (1 - parameter) * parameter ** 2 + parameter ** 3, 4);
	});
});

describe('frame to progress', () => {
	it('is (f − a) / (b − a)', () => {
		expect(tweenProgress(10, 10, 20)).toBe(0);
		expect(tweenProgress(15, 10, 20)).toBe(0.5);
		expect(tweenProgress(18, 10, 20)).toBe(0.8);
		expect(tweenProgress(20, 10, 20)).toBe(1);
		expect(tweenProgress(3, 3, 3)).toBe(1);
	});
});

describe('rotation directions', () => {
	it('turns the shorter way on Auto, clockwise for exactly half a turn', () => {
		expect(rotationDelta(10, 50, RotateDirection.Auto, 0)).toBe(40);
		expect(rotationDelta(10, 350, RotateDirection.Auto, 0)).toBe(-20);
		expect(rotationDelta(0, 180, RotateDirection.Auto, 0)).toBe(180);
		expect(rotationDelta(90, 90, RotateDirection.Auto, 0)).toBe(0);
	});

	it('adds extra turns in the direction it goes', () => {
		expect(rotationDelta(10, 50, RotateDirection.Auto, 2)).toBe(760);
		expect(rotationDelta(10, 350, RotateDirection.Auto, 1)).toBe(-380);
		expect(rotationDelta(0, 0, RotateDirection.Auto, 1)).toBe(360);
	});

	it('always turns clockwise or counter-clockwise when asked', () => {
		expect(rotationDelta(10, 350, RotateDirection.Clockwise, 0)).toBe(340);
		expect(rotationDelta(350, 10, RotateDirection.Clockwise, 1)).toBe(380);
		expect(rotationDelta(10, 50, RotateDirection.CounterClockwise, 0)).toBe(-320);
		expect(rotationDelta(50, 10, RotateDirection.CounterClockwise, 2)).toBe(-760);
		expect(rotationDelta(30, 30, RotateDirection.CounterClockwise, 1)).toBe(-360);
		expect(rotationDelta(30, 30, RotateDirection.Clockwise, 0)).toBe(0);
	});

	it('ignores fractional and negative extra turns beyond whole ones', () => {
		expect(rotationDelta(0, 90, RotateDirection.Clockwise, 1.7)).toBe(450);
		expect(rotationDelta(0, 90, RotateDirection.Clockwise, -3)).toBe(90);
	});
});

describe('motion tween interpolation', () => {
	it('moves the pivot in a straight line', () => {
		const from = shape();
		const to = shape({ rect: { x: 100, y: 40, width: 10, height: 10 } });
		const middle = interpolateItem(from, to, motion(), 0.5);
		expect(genericShape(middle).geometry.rect).toEqual({ x: 50, y: 20, width: 10, height: 10 });
	});

	it('scales x and y about the pivot', () => {
		const from = shape({ pivot: { x: 0, y: 0 } });
		const to = shape({ rect: { x: 0, y: 0, width: 30, height: 50 }, pivot: { x: 0, y: 0 } });
		const middle = interpolateItem(from, to, motion(), 0.5);
		expect(genericShape(middle).geometry.rect).toEqual({ x: 0, y: 0, width: 20, height: 30 });
		expect(middle.pivot).toEqual({ x: 0, y: 0 });
	});

	it('turns about the pivot the chosen way, with extra turns', () => {
		const from = shape({ pivot: { x: 0, y: 0 } });
		const to = shape({ rotation: 90, pivot: { x: 0, y: 0 } });
		const quarter = interpolateItem(from, to, motion({ rotate: RotateDirection.Clockwise, extraTurns: 1 }), 0.25);
		expect(quarter.rotation).toBeCloseTo(112.5, PRECISION);
		// Turned about its centre, the second keyframe's top-left pivot lies at (10, 0); the pivot travels a quarter of the way there.
		const pivot = itemPivotPoint(quarter);
		expect(pivot.x).toBeCloseTo(2.5, PRECISION);
		expect(pivot.y).toBeCloseTo(0, PRECISION);
		const back = interpolateItem(from, to, motion({ rotate: RotateDirection.CounterClockwise }), 0.5);
		expect(back.rotation).toBeCloseTo(225, PRECISION);
	});

	it('interpolates the pivot itself and drops it again once it is the centre', () => {
		const from = shape({ pivot: { x: 0, y: 0 } });
		const to = shape({ pivot: { x: 1, y: 1 } });
		expect(interpolateItem(from, to, motion(), 0.25).pivot).toEqual({ x: 0.25, y: 0.25 });
		expect(interpolateItem(from, to, motion(), 0.5).pivot).toBeUndefined();
	});

	it('changes opacity and line and fill colours channel by channel', () => {
		const from = shape({ opacity: 0, color: '#000000', fillColor: 'rgba(255, 0, 0, 0)' });
		const to = shape({ opacity: 1, color: '#ffffff', fillColor: '#ff0000' });
		const middle = interpolateItem(from, to, motion(), 0.5) as ShapeAnnotation;
		expect(middle.opacity).toBe(0.5);
		expect(middle.color).toBe('#808080');
		expect(middle.fillColor).toBe('rgba(255, 0, 0, 0.5)');
	});

	it('changes gradients stop by stop when they pair up', () => {
		const from = shape({ fillGradient: linearGradient(['#000000', '#ffffff']) });
		const to = shape({ fillGradient: linearGradient(['#ffffff', '#000000'], 90) });
		const middle = interpolateItem(from, to, motion(), 0.5) as ShapeAnnotation;
		expect(middle.fillGradient?.stops.map(({ color }) => color)).toEqual(['#808080', '#808080']);
		expect(middle.fillGradient?.start.x).toBeCloseTo(0.25, PRECISION);
	});

	it('applies the ease to every property', () => {
		const from = shape({ opacity: 0 });
		const to = shape({ opacity: 1, rect: { x: 100, y: 0, width: 10, height: 10 } });
		const eased = interpolateItem(from, to, motion({ ease: { kind: Ease.EaseIn } }), 0.5) as ShapeAnnotation;
		expect(eased.opacity).toBe(0.25);
		expect(eased.rect.x).toBe(25);
	});

	it('holds the first item when the kinds differ', () => {
		const text: TextAnnotation = { id: 'box', type: AnnotationObjectTypeId.Text, at: { x: 0, y: 0 }, text: 'A', color: '#000000', size: 12 };
		expect(interpolateItem(shape(), text, motion(), 0.5)).toEqual(shape());
	});

	it('leaves the source items unchanged', () => {
		const from = shape();
		const to = shape({ rect: { x: 50, y: 50, width: 20, height: 20 } });
		interpolateItem(from, to, motion(), 0.5);
		expect(from).toEqual(shape());
	});
});

describe('colour interpolation', () => {
	it('holds colours and gradients that cannot be paired', () => {
		expect(lerpCssColor('red', '#0000ff', 0.5)).toBe('red');
		expect(lerpCssColor('red', '#0000ff', 1)).toBe('#0000ff');
		expect(lerpCssColor('#123456', '#123456', 0.5)).toBe('#123456');
		const two = linearGradient(['#000000', '#ffffff']);
		const three = linearGradient(['#000000', '#888888', '#ffffff']);
		expect(lerpGradient(two, three, 0.5)).toBe(two);
		expect(lerpGradient(two, { ...two, kind: GradientKind.Radial }, 1).kind).toBe(GradientKind.Radial);
	});

	it('reads short hex, alpha hex and functional colours', () => {
		expect(lerpCssColor('#000', '#fff', 0.5)).toBe('#808080');
		expect(lerpCssColor('#00000000', '#000000ff', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
		expect(lerpCssColor('rgb(0 0 0 / 0%)', 'rgb(100% 100% 100%)', 0.5)).toBe('rgba(128, 128, 128, 0.5)');
		expect(lerpCssColor('rgb(0, 0)', '#ffffff', 0.5)).toBe('rgb(0, 0)');
		expect(lerpCssColor('rgb(a, b, c)', '#ffffff', 0.5)).toBe('rgb(a, b, c)');
	});
});
