import type { Keyframe } from './animationTypes';
import { EditMode } from './timelineModel';

/** The next thing to do to make an animation, which the timeline says in plain words. */
export const GuideStep = {
	Draw: 'draw',
	PickLaterFrame: 'pickLaterFrame',
	ChangePose: 'changePose',
	AddTween: 'addTween',
	Play: 'play',
	Playing: 'playing',
} as const;
export type GuideStep = (typeof GuideStep)[keyof typeof GuideStep];

/** What the next step depends on. */
export interface GuideFacts {
	readonly playing: boolean;
	/** Whether anything is drawn on any frame. */
	readonly hasDrawing: boolean;
	/** The active layer's keyframes, in frame order. */
	readonly keyframes: readonly Pick<Keyframe, 'frame' | 'tween'>[];
	readonly playhead: number;
	readonly editMode: EditMode;
}

/**
 * The next step: draw; choose a later frame; change the drawing there; join
 * poses with a tween where they are not joined; then play.
 */
export function guideStep({ playing, hasDrawing, keyframes, playhead, editMode }: GuideFacts): GuideStep {
	if (playing) return GuideStep.Playing;
	if (!hasDrawing) return GuideStep.Draw;
	const last = keyframes.at(-1);
	if (!last || playhead > last.frame) return GuideStep.ChangePose;
	if (keyframes.length === 1) return GuideStep.PickLaterFrame;
	if (editMode === EditMode.Hold && keyframes.slice(0, -1).some(({ tween }) => !tween)) return GuideStep.AddTween;
	return GuideStep.Play;
}

/** Each step in plain words; changing a pose depends on whether the editor animates by itself. */
export const GUIDE_TEXT: Readonly<Record<GuideStep, Readonly<Record<EditMode, string>>>> = {
	[GuideStep.Draw]: sameInEveryMode('Draw something on the canvas: a shape, a line or some text.'),
	[GuideStep.PickLaterFrame]: sameInEveryMode('Now click a later frame in the timeline, for example frame 24: that is when your drawing will have changed.'),
	[GuideStep.ChangePose]: {
		[EditMode.AutoAnimate]: 'Move, turn, resize or recolour your drawing. The frames in between are made for you. Alt-drag the small circle to change the point it turns around.',
		[EditMode.Hold]: 'Press Insert keyframe, then change your drawing.',
	},
	[GuideStep.AddTween]: sameInEveryMode('Press Tween to make the frames between your poses move smoothly.'),
	[GuideStep.Play]: sameInEveryMode('Press Play (Enter) to watch it. To go on, click a later frame and change your drawing again.'),
	[GuideStep.Playing]: sameInEveryMode('Playing. Press Pause (Enter) to stop and keep editing.'),
};

function sameInEveryMode(text: string): Readonly<Record<EditMode, string>> {
	return { [EditMode.AutoAnimate]: text, [EditMode.Hold]: text };
}
