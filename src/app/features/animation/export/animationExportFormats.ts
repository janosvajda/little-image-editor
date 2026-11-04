/** What an animation can be exported as, to play anywhere. */
export const AnimationExportFormat = { Gif: 'image/gif', Webm: 'video/webm' } as const;
export type AnimationExportFormat = (typeof AnimationExportFormat)[keyof typeof AnimationExportFormat];

export interface AnimationExportFormatInfo {
	readonly label: string;
	readonly extension: string;
	/** Whether see-through areas can stay see-through. */
	readonly supportsTransparency: boolean;
	readonly hint: string;
}

export const ANIMATION_EXPORT_FORMATS: Readonly<Record<AnimationExportFormat, AnimationExportFormatInfo>> = {
	[AnimationExportFormat.Gif]: {
		label: 'Animated GIF',
		extension: 'gif',
		supportsTransparency: true,
		hint: 'An animated GIF plays in every browser, chat and document. It has up to 256 colours a frame, and pixels are either see-through or not.',
	},
	[AnimationExportFormat.Webm]: {
		label: 'WebM video',
		extension: 'webm',
		supportsTransparency: false,
		hint: 'A WebM video keeps every colour and stays small. It is recorded as it plays, so exporting takes as long as the animation.',
	},
};

export function isAnimationExportFormat(value: unknown): value is AnimationExportFormat {
	return Object.values(AnimationExportFormat).some((format) => format === value);
}
