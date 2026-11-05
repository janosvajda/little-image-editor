import type { AnnotationObject } from '../annotations/annotationTypes';

/**
 * A document's animation: a timeline of keyframes for each content layer.
 * Frames are counted from 0. The layers themselves, with their names,
 * visibility, lock, opacity and blend mode, stay the document's content
 * layers; the timeline only says what each layer holds at each frame.
 */

/** How the frames between a keyframe and the next one are drawn. */
export const TweenKind = {
	/** Each item kept in both keyframes moves, turns, scales and changes colour from one to the other. */
	Motion: 'motion',
} as const;
export type TweenKind = (typeof TweenKind)[keyof typeof TweenKind];

/** How a tween's progress is paced from its first keyframe to the next. */
export const Ease = {
	Linear: 'linear',
	EaseIn: 'easeIn',
	EaseOut: 'easeOut',
	EaseInOut: 'easeInOut',
	/** A CSS-style cubic Bézier through (0, 0), two control points and (1, 1). */
	Custom: 'custom',
} as const;
export type Ease = (typeof Ease)[keyof typeof Ease];

/** A custom ease's control points, `[x1, y1, x2, y2]`, as CSS `cubic-bezier()` takes them; each x is within 0..1. */
export type CubicBezierPoints = readonly [number, number, number, number];

export type EaseSpec =
	| { readonly kind: Exclude<Ease, typeof Ease.Custom> }
	| { readonly kind: typeof Ease.Custom; readonly points: CubicBezierPoints };

/** Which way an item turns from one keyframe's rotation to the next. */
export const RotateDirection = {
	/** The shorter way round. */
	Auto: 'auto',
	Clockwise: 'clockwise',
	CounterClockwise: 'counterClockwise',
} as const;
export type RotateDirection = (typeof RotateDirection)[keyof typeof RotateDirection];

export interface MotionTween {
	readonly kind: typeof TweenKind.Motion;
	readonly ease: EaseSpec;
	readonly rotate: RotateDirection;
	/** Whole turns added to the rotation, in its direction; an integer of 0 or more. */
	readonly extraTurns: number;
}

export type Tween = MotionTween;

/** A frame where a layer's content is defined. It lasts until the layer's next keyframe, or the layer's end. */
export interface Keyframe {
	readonly frame: number;
	/** The layer's items at this keyframe, bottom first. An item keeps its id on every keyframe of its layer. */
	readonly items: readonly AnnotationObject[];
	/** How the frames up to the next keyframe are drawn; `null` holds this keyframe's content. */
	readonly tween: Tween | null;
}

/** One content layer's frames. */
export interface LayerTimeline {
	/** Sorted by frame with none repeated; the first is at frame 0. */
	readonly keyframes: readonly Keyframe[];
	/** How many frames the layer has; it shows nothing from this frame on. At least 1. */
	readonly length: number;
}

export interface AnimationTimeline {
	/** Frames shown per second while playing. */
	readonly fps: number;
	/** The frame the document shows and edits. */
	readonly playhead: number;
	/** Each content layer's frames, by the layer's id. */
	readonly layers: Readonly<Record<string, LayerTimeline>>;
}

/** Limits and starting values of a timeline. */
export const AnimationDefaults = {
	Fps: 24,
	MinimumFps: 1,
	MaximumFps: 120,
	FirstFrame: 0,
	MinimumLayerLength: 1,
	/** The most frames a timeline can have, so a mistyped frame number cannot make one enormous. */
	MaximumFrames: 10_000,
	MinimumExtraTurns: 0,
} as const;

export const DEFAULT_EASE: EaseSpec = { kind: Ease.Linear };

/** The control points of CSS's own `ease`, where a custom ease starts. */
const CssEase = { X1: 0.25, Y1: 0.1, X2: 0.25, Y2: 1 } as const;
export const CSS_EASE_POINTS: CubicBezierPoints = [CssEase.X1, CssEase.Y1, CssEase.X2, CssEase.Y2];

/** A new motion tween: steady, turning the shorter way, with no extra turns. */
export function defaultMotionTween(): MotionTween {
	return { kind: TweenKind.Motion, ease: DEFAULT_EASE, rotate: RotateDirection.Auto, extraTurns: AnimationDefaults.MinimumExtraTurns };
}
