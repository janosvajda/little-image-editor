import { TooltipAttribute } from './tooltipConfiguration';

export interface TooltipContentResolver {
	resolve(target: HTMLElement): string;
}

export class AccessibleTooltipContentResolver
	implements TooltipContentResolver
{
	resolve(target: HTMLElement): string {
		const configured = target.dataset.tooltip;
		const nativeTitle = target.getAttribute(TooltipAttribute.NativeTitle) ?? '';
		const text = configured ?? nativeTitle;
		if (!text || configured) return text;
		target.dataset.tooltip = text;
		target.removeAttribute(TooltipAttribute.NativeTitle);
		if (!target.hasAttribute(TooltipAttribute.AccessibleLabel))
			target.setAttribute(TooltipAttribute.AccessibleLabel, text);
		return text;
	}
}
