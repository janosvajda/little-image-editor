export const TooltipAttribute = {
	Content: 'data-tooltip',
	NativeTitle: 'title',
	AccessibleLabel: 'aria-label',
	DescribedBy: 'aria-describedby',
	Role: 'role',
} as const;

export const TooltipEvent = {
	PointerOver: 'pointerover',
	PointerOut: 'pointerout',
	PointerMove: 'pointermove',
	PointerDown: 'pointerdown',
	KeyDown: 'keydown',
	FocusIn: 'focusin',
	FocusOut: 'focusout',
	WindowBlur: 'blur',
} as const;

export const TooltipKeyboardNavigationKeys = new Set([
	'Tab',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
]);

export interface TooltipConfiguration {
	readonly selector: string;
	readonly id: string;
	readonly className: string;
	readonly role: string;
	readonly showDelayMs: number;
	readonly viewportMarginPx: number;
	readonly pointerOffset: Readonly<{ x: number; y: number }>;
	readonly targetOffsetY: number;
}

export const DEFAULT_TOOLTIP_CONFIGURATION: TooltipConfiguration = {
	selector: `[${TooltipAttribute.Content}], [${TooltipAttribute.NativeTitle}]`,
	id: 'appTooltip',
	className: 'app-tooltip',
	role: 'tooltip',
	showDelayMs: 350,
	viewportMarginPx: 8,
	pointerOffset: { x: 12, y: 18 },
	targetOffsetY: 8,
} as const;
