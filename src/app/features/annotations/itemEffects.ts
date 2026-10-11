import { colorWithAlpha } from '../../core/document/cssColor';
import { ColorPalette } from '../../core/document/colorPalette';
import type { AnnotationObject, ItemEffects, ItemShadow } from './annotationTypes';
import { AnnotationObjectTypeId } from './annotationTypes';

/**
 * Item effects, as SVG filters give them: a Gaussian blur, and a drop shadow
 * beneath. Spreads are SVG's standard deviations, so an effect is the same on
 * the canvas, in a `.limg` project and in an SVG.
 */

/** A shadow a new one starts as: soft, falling down and to the right. */
export const DEFAULT_SHADOW: ItemShadow = { color: ColorPalette.Black, opacity: 0.35, offset: { x: 6, y: 6 }, softness: 4 };

/** How far each effect can be set, in image pixels. */
export const EffectRange = {
	Blur: { Minimum: 0, Maximum: 40 },
	ShadowDistance: { Minimum: 0, Maximum: 80 },
	ShadowSoftness: { Minimum: 0, Maximum: 40 },
} as const;

/** A Gaussian blur reaches about three spreads before it fades out. */
const BLUR_REACH = 3;
/** CSS names a drop shadow's blur by twice its spread. */
const CSS_SHADOW_BLUR_PER_SPREAD = 2;
/** A new shadow's direction once its distance is set from none: down and to the right. */
const DEFAULT_SHADOW_ANGLE = Math.atan2(DEFAULT_SHADOW.offset.y, DEFAULT_SHADOW.offset.x);

/** Whether an item can have effects: every item but a blur, which is an effect of its own. */
export function takesEffects(item: Pick<AnnotationObject, 'type'>): boolean {
	return item.type !== AnnotationObjectTypeId.Blur;
}

/** Whether effects change anything: a blur with a spread, or a shadow. */
export function hasVisibleEffects(effects: ItemEffects | undefined): effects is ItemEffects {
	return Boolean(effects && ((effects.blur ?? 0) > 0 || effects.shadow));
}

/** Effects as a canvas filter: the blur first, then the shadow of what it blurred. */
export function effectFilter({ blur = 0, shadow }: ItemEffects): string {
	const parts: string[] = [];
	if (blur > 0) parts.push(`blur(${blur}px)`);
	if (shadow)
		parts.push(
			`drop-shadow(${shadow.offset.x}px ${shadow.offset.y}px ${shadow.softness * CSS_SHADOW_BLUR_PER_SPREAD}px ${colorWithAlpha(shadow.color, shadow.opacity)})`,
		);
	return parts.join(' ');
}

/** How far beyond an item its effects can reach. */
export function effectMargin(effects: ItemEffects | undefined): number {
	if (!hasVisibleEffects(effects)) return 0;
	const blur = (effects.blur ?? 0) * BLUR_REACH;
	const shadow = effects.shadow;
	const shadowReach = shadow ? Math.hypot(shadow.offset.x, shadow.offset.y) + shadow.softness * BLUR_REACH : 0;
	return blur + shadowReach;
}

/** How far a shadow falls from its item. */
export function shadowDistance(shadow: ItemShadow): number {
	return Math.hypot(shadow.offset.x, shadow.offset.y);
}

/** A shadow falling another distance in the same direction, down and to the right when it fell nowhere. */
export function withShadowDistance(shadow: ItemShadow, distance: number): ItemShadow {
	const angle = shadowDistance(shadow) ? Math.atan2(shadow.offset.y, shadow.offset.x) : DEFAULT_SHADOW_ANGLE;
	return { ...shadow, offset: { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance } };
}

/** Effects with one changed; none when nothing is left, so an item without effects keeps no empty record. */
export function changedEffects(effects: ItemEffects | undefined, change: Partial<ItemEffects>): ItemEffects | undefined {
	const next = { ...effects, ...change };
	const blur = next.blur && next.blur > 0 ? { blur: next.blur } : {};
	const shadow = next.shadow ? { shadow: next.shadow } : {};
	const result = { ...blur, ...shadow };
	return Object.keys(result).length ? result : undefined;
}

/** Whether a value read from a file is effects: an optional spread and an optional shadow. */
export function isOptionalItemEffects(value: unknown): boolean {
	if (value === undefined) return true;
	if (typeof value !== 'object' || value === null) return false;
	const effects = value as Record<string, unknown>;
	return (effects.blur === undefined || isSpread(effects.blur)) && (effects.shadow === undefined || isShadow(effects.shadow));
}

function isSpread(value: unknown): boolean {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isShadow(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const shadow = value as Record<string, unknown>;
	const offset = shadow.offset as Record<string, unknown> | undefined;
	return (
		typeof shadow.color === 'string' &&
		typeof shadow.opacity === 'number' &&
		shadow.opacity >= 0 &&
		shadow.opacity <= 1 &&
		isSpread(shadow.softness) &&
		typeof offset === 'object' &&
		offset !== null &&
		Number.isFinite(offset.x) &&
		Number.isFinite(offset.y)
	);
}
