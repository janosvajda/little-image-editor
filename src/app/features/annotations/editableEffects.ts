import type { AnnotationObject } from './annotationTypes';
import { changedEffects, DEFAULT_SHADOW, EffectRange, shadowDistance, takesEffects, withShadowDistance } from './itemEffects';

/**
 * An item's effects as properties a person sets: a blur, and a shadow with
 * its colour, distance and softness. They are their own family beside the
 * item's line and fill, shown together where effects are edited.
 */

export const EffectPropertyId = {
	Blur: 'blur',
	Shadow: 'shadow',
	ShadowColor: 'shadowColor',
	ShadowDistance: 'shadowDistance',
	ShadowSoftness: 'shadowSoftness',
} as const;
export type EffectProperty = (typeof EffectPropertyId)[keyof typeof EffectPropertyId];

export interface EffectPropertyValues {
	readonly blur: number;
	readonly shadow: boolean;
	/** Only while the item casts a shadow: its colour, distance and softness. */
	readonly shadowColor?: string;
	readonly shadowDistance?: number;
	readonly shadowSoftness?: number;
}

/** An item's effects as properties; none for an item that takes no effects. */
export function editableEffects(item: Readonly<AnnotationObject>): EffectPropertyValues | null {
	if (!takesEffects(item)) return null;
	const shadow = item.effects?.shadow;
	return {
		blur: item.effects?.blur ?? 0,
		shadow: shadow !== undefined,
		...(shadow ? { shadowColor: shadow.color, shadowDistance: shadowDistance(shadow), shadowSoftness: shadow.softness } : {}),
	};
}

/** Sets one effect on an item, keeping it within the range it can be set to. */
export function setEffectProperty(item: AnnotationObject, property: EffectProperty, value: string | number | boolean): void {
	if (!takesEffects(item)) return;
	const shadow = item.effects?.shadow;
	const effects = changedEffects(item.effects, effectChange(property, value, shadow ?? DEFAULT_SHADOW, shadow !== undefined));
	if (effects) item.effects = effects;
	else Reflect.deleteProperty(item, 'effects');
}

type ShadowOf = NonNullable<NonNullable<AnnotationObject['effects']>['shadow']>;

/** What setting one property changes; a shadow's own settings change only a shadow there is. */
function effectChange(property: EffectProperty, value: string | number | boolean, shadow: ShadowOf, casting: boolean): Partial<NonNullable<AnnotationObject['effects']>> {
	if (property === EffectPropertyId.Shadow) return typeof value === 'boolean' ? { shadow: value ? shadow : undefined } : {};
	if (property === EffectPropertyId.Blur) return typeof value === 'number' ? { blur: within(value, EffectRange.Blur) } : {};
	if (!casting) return {};
	if (property === EffectPropertyId.ShadowColor) return typeof value === 'string' ? { shadow: { ...shadow, color: value } } : {};
	if (typeof value !== 'number') return {};
	if (property === EffectPropertyId.ShadowDistance) return { shadow: withShadowDistance(shadow, within(value, EffectRange.ShadowDistance)) };
	return { shadow: { ...shadow, softness: within(value, EffectRange.ShadowSoftness) } };
}

function within(value: number, range: Readonly<{ Minimum: number; Maximum: number }>): number {
	return Math.min(range.Maximum, Math.max(range.Minimum, value));
}
