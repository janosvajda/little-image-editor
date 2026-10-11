import type { Point } from '../../core/document/appTypes';
import { type AffineMatrix, averageScale, multiplyMatrices, parseTransform, transformPoint } from '../../core/geometry/affineMatrix';
import { FillRule, mapPathPoints, type PathContour } from '../../core/geometry/vectorPath';
import type { ItemEffects, ItemShadow } from '../annotations/annotationTypes';
import { elementOutline, type SvgReadingContext } from './svgElements';
import { FilterInput } from './svgExport';
import { elementById, parseColor } from './svgPaint';
import { elementStyle, INITIAL_SVG_STYLE, SvgKeyword, SvgProperty, type SvgStyle, styleNumber, styleOpacity } from './svgStyle';

/**
 * An element's filter and clip, as the editor keeps them on its items: a
 * filter of a Gaussian blur and a drop shadow becomes effects, and a clipPath
 * of shapes becomes a clip. Any other filter, and any mask, can only be kept
 * by drawing the element as a picture.
 */

/** The effects and the clip an element gives the items it becomes. */
export interface ItemLook {
	readonly effects?: ItemEffects;
	/** The clip's outline on the image, and how it is filled. */
	readonly clip?: { readonly contours: PathContour[]; readonly fillRule: FillRule };
}

const REFERENCE = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/i;
const FilterStep = { Blur: 'feGaussianBlur', DropShadow: 'feDropShadow' } as const;
const DESCRIPTIVE_ELEMENTS: ReadonlySet<string> = new Set(['title', 'desc']);
/** What SVG gives a drop shadow that leaves out its offset and spread. */
const DROP_SHADOW_DEFAULT = 2;
const CLIP_PATH_UNITS_USER_SPACE = 'userSpaceOnUse';

/** The look an element with this style gives its items; none when it has one only a picture can keep. */
export function readLook(style: SvgStyle, matrix: AffineMatrix, context: SvgReadingContext): ItemLook | null {
	if (!isNone(style[SvgProperty.Mask])) return null;
	const effects = isNone(style[SvgProperty.Filter]) ? undefined : readFilter(style[SvgProperty.Filter], matrix, context);
	const clip = isNone(style[SvgProperty.ClipPath]) ? undefined : readClip(style[SvgProperty.ClipPath], matrix, context);
	if (effects === null || clip === null) return null;
	return { ...(effects ? { effects } : {}), ...(clip ? { clip } : {}) };
}

function isNone(value: string): boolean {
	return value.trim().toLowerCase() === SvgKeyword.None;
}

function referenced(value: string, context: SvgReadingContext, name: string): Element | null {
	const id = REFERENCE.exec(value.trim())?.[1];
	const element = id ? elementById(context.root, id) : null;
	return element?.localName === name ? element : null;
}

/** A filter as effects: a blur, a drop shadow, or a blur then a shadow of what it blurred. */
function readFilter(value: string, matrix: AffineMatrix, context: SvgReadingContext): ItemEffects | null {
	const filter = referenced(value, context, 'filter');
	if (!filter) return null;
	const steps = [...filter.children].filter((step) => !DESCRIPTIVE_ELEMENTS.has(step.localName));
	const [first, second, ...rest] = steps;
	if (!first || rest.length) return null;
	const scale = averageScale(matrix);
	if (first.localName === FilterStep.DropShadow && !second) {
		const shadow = readShadow(first, matrix, context);
		return shadow && fromSource(first) ? { shadow } : null;
	}
	const blur = first.localName === FilterStep.Blur && fromSource(first) ? readBlur(first) : null;
	if (blur === null) return null;
	if (!second) return { blur: blur * scale };
	const result = first.getAttribute('result');
	const shadow = second.localName === FilterStep.DropShadow && result && second.getAttribute('in') === result ? readShadow(second, matrix, context) : null;
	return shadow ? { blur: blur * scale, shadow } : null;
}

/** Whether a step works on the element itself, as the first step of the editor's filters does. */
function fromSource(step: Element): boolean {
	const input = step.getAttribute('in');
	return input === null || input === FilterInput.Source;
}

/** A blur's spread; none for a blur spread differently along each side, which the editor's blur is not. */
function readBlur(step: Element): number | null {
	const [x, y = x] = (step.getAttribute('stdDeviation') ?? '0').trim().split(/[\s,]+/).map(Number);
	return x !== undefined && Number.isFinite(x) && x === y && x >= 0 ? x : null;
}

/** A drop shadow, its offset and softness carried onto the image with the element. */
function readShadow(step: Element, matrix: AffineMatrix, context: SvgReadingContext): ItemShadow | null {
	const style = elementStyle(step, INITIAL_SVG_STYLE, context.sheet);
	const color = parseColor(step.getAttribute('flood-color') ?? 'black', style[SvgProperty.Color]);
	const softness = readBlur(step);
	if (!color || softness === null) return null;
	const offset: Point = { x: styleNumber(step.getAttribute('dx') ?? '', DROP_SHADOW_DEFAULT), y: styleNumber(step.getAttribute('dy') ?? '', DROP_SHADOW_DEFAULT) };
	const [a, b, c, d] = matrix;
	return {
		color: color.color,
		opacity: color.alpha * styleOpacity(step.getAttribute('flood-opacity') ?? '1'),
		offset: transformPoint([a, b, c, d, 0, 0], offset),
		softness: (step.hasAttribute('stdDeviation') ? softness : DROP_SHADOW_DEFAULT) * averageScale(matrix),
	};
}

/** A clipPath of shapes as one outline on the image; none for a clip of anything else. */
function readClip(value: string, matrix: AffineMatrix, context: SvgReadingContext): ItemLook['clip'] | null {
	const clipPath = referenced(value, context, 'clipPath');
	const units = clipPath?.getAttribute('clipPathUnits');
	if (!clipPath || (units !== null && units !== CLIP_PATH_UNITS_USER_SPACE)) return null;
	const contours: PathContour[] = [];
	let fillRule: FillRule = FillRule.NonZero;
	for (const shape of [...clipPath.children].filter((child) => !DESCRIPTIVE_ELEMENTS.has(child.localName))) {
		const outline = elementOutline(shape, context);
		const transform = parseTransform(shape.getAttribute('transform'));
		if (!outline || !transform) return null;
		const onImage = multiplyMatrices(matrix, transform);
		contours.push(...mapPathPoints(outline, (point) => transformPoint(onImage, point)));
		if (elementStyle(shape, INITIAL_SVG_STYLE, context.sheet)[SvgProperty.ClipRule] === FillRule.EvenOdd) fillRule = FillRule.EvenOdd;
	}
	return contours.length ? { contours, fillRule } : null;
}
