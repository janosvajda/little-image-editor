/**
 * The style of an SVG element as SVG resolves it: presentation attributes,
 * then the file's own style sheet, then the element's `style` attribute,
 * with inherited properties taken from its parent. The style sheet's simple
 * rules are read: by element name, class and id, as design tools write them.
 */

/** The properties SVG import reads. */
export const SvgProperty = {
	Fill: 'fill',
	FillOpacity: 'fill-opacity',
	FillRule: 'fill-rule',
	Stroke: 'stroke',
	StrokeOpacity: 'stroke-opacity',
	StrokeWidth: 'stroke-width',
	StrokeDasharray: 'stroke-dasharray',
	Opacity: 'opacity',
	Color: 'color',
	FontSize: 'font-size',
	TextAnchor: 'text-anchor',
	WhiteSpace: 'white-space',
	Display: 'display',
	Visibility: 'visibility',
	MarkerStart: 'marker-start',
	MarkerMid: 'marker-mid',
	MarkerEnd: 'marker-end',
	MixBlendMode: 'mix-blend-mode',
	Filter: 'filter',
	Mask: 'mask',
	ClipPath: 'clip-path',
	ClipRule: 'clip-rule',
	StopColor: 'stop-color',
	StopOpacity: 'stop-opacity',
} as const;
export type SvgProperty = (typeof SvgProperty)[keyof typeof SvgProperty];

export type SvgStyle = Readonly<Record<SvgProperty, string>>;

/** Keywords SVG properties share. */
export const SvgKeyword = { None: 'none', Inherit: 'inherit', Hidden: 'hidden', Collapse: 'collapse', CurrentColor: 'currentcolor' } as const;

/** Properties a child takes from its parent unless it sets its own. */
const INHERITED: ReadonlySet<SvgProperty> = new Set([
	SvgProperty.Fill,
	SvgProperty.FillOpacity,
	SvgProperty.FillRule,
	SvgProperty.ClipRule,
	SvgProperty.Stroke,
	SvgProperty.StrokeOpacity,
	SvgProperty.StrokeWidth,
	SvgProperty.StrokeDasharray,
	SvgProperty.Color,
	SvgProperty.FontSize,
	SvgProperty.TextAnchor,
	SvgProperty.WhiteSpace,
	SvgProperty.Visibility,
	SvgProperty.MarkerStart,
	SvgProperty.MarkerMid,
	SvgProperty.MarkerEnd,
]);

/** Each property's value where nothing sets it, as SVG defines. */
export const INITIAL_SVG_STYLE: SvgStyle = {
	[SvgProperty.Fill]: 'black',
	[SvgProperty.FillOpacity]: '1',
	[SvgProperty.FillRule]: 'nonzero',
	[SvgProperty.Stroke]: SvgKeyword.None,
	[SvgProperty.StrokeOpacity]: '1',
	[SvgProperty.StrokeWidth]: '1',
	[SvgProperty.StrokeDasharray]: SvgKeyword.None,
	[SvgProperty.Opacity]: '1',
	[SvgProperty.Color]: 'black',
	[SvgProperty.FontSize]: '16',
	[SvgProperty.TextAnchor]: 'start',
	[SvgProperty.WhiteSpace]: 'normal',
	[SvgProperty.Display]: 'inline',
	[SvgProperty.Visibility]: 'visible',
	[SvgProperty.MarkerStart]: SvgKeyword.None,
	[SvgProperty.MarkerMid]: SvgKeyword.None,
	[SvgProperty.MarkerEnd]: SvgKeyword.None,
	[SvgProperty.MixBlendMode]: 'normal',
	[SvgProperty.Filter]: SvgKeyword.None,
	[SvgProperty.Mask]: SvgKeyword.None,
	[SvgProperty.ClipPath]: SvgKeyword.None,
	[SvgProperty.ClipRule]: 'nonzero',
	[SvgProperty.StopColor]: 'black',
	[SvgProperty.StopOpacity]: '1',
};

const PROPERTY_NAMES: ReadonlySet<string> = new Set(Object.values(SvgProperty));
/** The `font` shorthand, whose size SVG import reads. */
const FONT_SHORTHAND = 'font';
/** The size in a `font` shorthand: the number just before the family, which a weight never is. */
const FONT_SHORTHAND_SIZE = /(?:^|\s)(\d+\.?\d*|\.\d+)(?:px)?(?:\/\S+)?\s+(?=[^\d\s])/;
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
/** An at-rule with its block, which may hold rules of its own; its rules apply only sometimes, so they are left out. */
const AT_RULE = /@[^{;]*(?:;|\{(?:[^{}]|\{[^{}]*\})*\})/g;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const COMPOUND_SELECTOR = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/;
const SELECTOR_PART = /([.#])([\w-]+)/g;
const IMPORTANT = /\s*!important\s*$/i;

function isSvgProperty(name: string): name is SvgProperty {
	return PROPERTY_NAMES.has(name);
}

/** Declarations as properties SVG import reads, the `font` shorthand giving its size. */
export function parseDeclarations(text: string): Map<SvgProperty, string> {
	const declarations = new Map<SvgProperty, string>();
	for (const declaration of text.split(';')) {
		const colon = declaration.indexOf(':');
		if (colon < 0) continue;
		const name = declaration.slice(0, colon).trim().toLowerCase();
		const value = declaration.slice(colon + 1).replace(IMPORTANT, '').trim();
		if (!value) continue;
		if (isSvgProperty(name)) declarations.set(name, value);
		else if (name === FONT_SHORTHAND) {
			const size = FONT_SHORTHAND_SIZE.exec(value)?.[1];
			if (size) declarations.set(SvgProperty.FontSize, size);
		}
	}
	return declarations;
}

/** One simple selector: an element name, classes and an id, all of which an element must have. */
interface SimpleSelector {
	readonly name?: string;
	readonly id?: string;
	readonly classes: readonly string[];
	/** How specific it is, ids first, then classes, then names, as one comparable number. */
	readonly specificity: number;
}

const SPECIFICITY = { Id: 10_000, Class: 100, Name: 1 } as const;

function parseSelector(text: string): SimpleSelector | null {
	const match = COMPOUND_SELECTOR.exec(text.trim());
	if (!match || !(match[1] || match[2])) return null;
	const name = match[1] && match[1] !== '*' ? match[1] : undefined;
	let id: string | undefined;
	const classes: string[] = [];
	for (const [, kind, value] of (match[2] ?? '').matchAll(SELECTOR_PART)) {
		if (kind === '#') id = value;
		else classes.push(value!);
	}
	const specificity = (id ? SPECIFICITY.Id : 0) + classes.length * SPECIFICITY.Class + (name ? SPECIFICITY.Name : 0);
	return { name, id, classes, specificity };
}

function selects(selector: SimpleSelector, element: Element): boolean {
	if (selector.name && selector.name !== element.localName) return false;
	if (selector.id && selector.id !== element.getAttribute('id')) return false;
	const classes = (element.getAttribute('class') ?? '').split(/\s+/);
	return selector.classes.every((name) => classes.includes(name));
}

interface StyleRule {
	readonly selector: SimpleSelector;
	readonly declarations: ReadonlyMap<SvgProperty, string>;
	readonly order: number;
}

/** The rules of an SVG's own `<style>` elements that select by name, class and id. */
export class SvgStyleSheet {
	readonly #rules: StyleRule[] = [];

	constructor(root: Element) {
		const text = [...root.getElementsByTagName('style')].map((style) => style.textContent ?? '').join('\n');
		const css = text.replace(CSS_COMMENT, '').replace(AT_RULE, '');
		for (const [, selectors = '', body = ''] of css.matchAll(RULE)) {
			const declarations = parseDeclarations(body);
			for (const selector of selectors.split(',').map(parseSelector))
				if (selector && declarations.size) this.#rules.push({ selector, declarations, order: this.#rules.length });
		}
		this.#rules.sort((first, second) => first.selector.specificity - second.selector.specificity || first.order - second.order);
	}

	/** What the sheet sets on an element, the most specific last. */
	declarationsFor(element: Element): Map<SvgProperty, string> {
		const declarations = new Map<SvgProperty, string>();
		for (const rule of this.#rules) if (selects(rule.selector, element)) for (const [name, value] of rule.declarations) declarations.set(name, value);
		return declarations;
	}
}

/** An element's resolved style: its own settings over what it inherits from `parent`. */
export function elementStyle(element: Element, parent: SvgStyle, sheet: SvgStyleSheet): SvgStyle {
	const own = new Map<SvgProperty, string>();
	for (const name of PROPERTY_NAMES as ReadonlySet<SvgProperty>) {
		const value = element.getAttribute(name)?.trim();
		if (value) own.set(name, value);
	}
	for (const [name, value] of sheet.declarationsFor(element)) own.set(name, value);
	for (const [name, value] of parseDeclarations(element.getAttribute('style') ?? '')) own.set(name, value);
	const style: Record<SvgProperty, string> = { ...INITIAL_SVG_STYLE };
	for (const name of PROPERTY_NAMES as ReadonlySet<SvgProperty>) {
		const value = own.get(name);
		if (value !== undefined && value.toLowerCase() !== SvgKeyword.Inherit) style[name] = value;
		else if (value !== undefined || INHERITED.has(name)) style[name] = parent[name];
	}
	return style;
}

/** Whether an element with this style is drawn at all. */
export function isDisplayed(style: SvgStyle): boolean {
	return style[SvgProperty.Display] !== SvgKeyword.None;
}

/** Whether an element with this style shows; a hidden one is kept, hidden. */
export function isVisible(style: SvgStyle): boolean {
	const visibility = style[SvgProperty.Visibility].toLowerCase();
	return visibility !== SvgKeyword.Hidden && visibility !== SvgKeyword.Collapse;
}

/** A number in a style, or the given fallback when it is not one; percentages are fractions. */
export function styleNumber(value: string, fallback: number): number {
	const trimmed = value.trim();
	const number = Number.parseFloat(trimmed);
	if (!Number.isFinite(number)) return fallback;
	return trimmed.endsWith('%') ? number / PERCENT : number;
}

const PERCENT = 100;

/** An opacity in a style, kept between none and full. */
export function styleOpacity(value: string): number {
	return Math.min(1, Math.max(0, styleNumber(value, 1)));
}
