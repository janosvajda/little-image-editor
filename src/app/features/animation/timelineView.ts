import type { ContentLayer } from '../annotations/annotationTypes';
import { AnimationDefaults, Ease, type LayerTimeline, RotateDirection } from './animationTypes';

/** What a frame cell shows, as Flash's timeline does. */
export const FrameCellKind = {
	/** A keyframe holding items: a filled dot. */
	Keyframe: 'keyframe',
	/** A keyframe holding nothing: a hollow dot. */
	EmptyKeyframe: 'emptyKeyframe',
	/** A frame holding its keyframe's content: plain. */
	Held: 'held',
	/** Past the layer's end. */
	Empty: 'empty',
} as const;
export type FrameCellKind = (typeof FrameCellKind)[keyof typeof FrameCellKind];

/** Whether a frame is part of a motion tween: one with a keyframe to end on is an arrow span, one without is broken. */
export const FrameTweenState = { None: 'none', Tweened: 'tweened', Broken: 'broken' } as const;
export type FrameTweenState = (typeof FrameTweenState)[keyof typeof FrameTweenState];

export interface FrameCellView {
	readonly kind: FrameCellKind;
	readonly tween: FrameTweenState;
}

export interface TimelineLayerView {
	readonly id: string;
	readonly name: string;
	readonly visible: boolean;
	readonly locked: boolean;
	readonly active: boolean;
	readonly cells: readonly FrameCellView[];
}

/** Display settings of the timeline. */
export const TimelineDisplay = {
	/** Empty frames shown after the last one, to add keyframes and frames into. */
	TrailingFrames: 20,
	MinimumVisibleFrames: 60,
	/** Every this many frames, the ruler shows the frame number. */
	RulerLabelInterval: 5,
	/** Frame numbers are shown counting from 1, as Flash shows them; the document counts from 0. */
	FrameNumberOffset: 1,
	MinimumFrameWidth: 6,
	MaximumFrameWidth: 32,
	DefaultFrameWidth: 14,
} as const;

/** How many frame columns the timeline shows for `frameCount` frames. */
export function visibleFrameCount(frameCount: number): number {
	return Math.max(TimelineDisplay.MinimumVisibleFrames, frameCount + TimelineDisplay.TrailingFrames);
}

/** The cells of one layer's frames, `count` of them from frame 0. */
export function frameCells(layer: LayerTimeline | undefined, count: number): FrameCellView[] {
	const cells: FrameCellView[] = Array.from({ length: count }, () => ({ kind: FrameCellKind.Empty, tween: FrameTweenState.None }));
	if (!layer) return cells;
	layer.keyframes.forEach((keyframe, index) => {
		const end = Math.min(layer.keyframes[index + 1]?.frame ?? layer.length, count);
		const hasNext = index + 1 < layer.keyframes.length;
		const tween = keyframe.tween ? (hasNext ? FrameTweenState.Tweened : FrameTweenState.Broken) : FrameTweenState.None;
		for (let frame = keyframe.frame; frame < end; frame++)
			cells[frame] = {
				kind: frame !== keyframe.frame ? FrameCellKind.Held : keyframe.items.length ? FrameCellKind.Keyframe : FrameCellKind.EmptyKeyframe,
				tween,
			};
	});
	return cells;
}

/** The rows of the timeline, top layer first, as the Layers panel lists them. */
export function timelineLayerViews(
	layers: readonly ContentLayer[],
	timelines: Readonly<Record<string, LayerTimeline>>,
	activeLayerId: string | null,
	count: number,
): TimelineLayerView[] {
	return [...layers].reverse().map((layer) => ({
		id: layer.id,
		name: layer.name,
		visible: layer.visible !== false,
		locked: layer.locked === true,
		active: layer.id === activeLayerId,
		cells: timelines[layer.id] ? frameCells(timelines[layer.id], count) : firstFrameCells(layer, count),
	}));
}

/** A layer the timeline does not know yet: the one keyframe at frame 0 it will be given, holding what it holds now. */
function firstFrameCells(layer: ContentLayer, count: number): FrameCellView[] {
	const cells = frameCells(undefined, count);
	cells[AnimationDefaults.FirstFrame] = { kind: layer.itemIds.length ? FrameCellKind.Keyframe : FrameCellKind.EmptyKeyframe, tween: FrameTweenState.None };
	return cells;
}

export const EASE_LABELS: Readonly<Record<Ease, string>> = {
	[Ease.Linear]: 'Linear',
	[Ease.EaseIn]: 'Ease in',
	[Ease.EaseOut]: 'Ease out',
	[Ease.EaseInOut]: 'Ease in-out',
	[Ease.Custom]: 'Custom',
};

export const ROTATE_DIRECTION_LABELS: Readonly<Record<RotateDirection, string>> = {
	[RotateDirection.Auto]: 'Auto',
	[RotateDirection.Clockwise]: 'Clockwise',
	[RotateDirection.CounterClockwise]: 'Counter-clockwise',
};
