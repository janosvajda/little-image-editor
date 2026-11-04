import { AnimationDefaults } from './animationTypes';

const MILLISECONDS_PER_SECOND = 1000;

/** Whether playback goes back to the first frame after the last, or stops there. */
export const PlaybackMode = { Loop: 'loop', Once: 'once' } as const;
export type PlaybackMode = (typeof PlaybackMode)[keyof typeof PlaybackMode];

export interface PlaybackSettings {
	readonly fps: number;
	readonly frameCount: number;
	/** The frame playback starts from: the playhead. */
	readonly startFrame: number;
	readonly mode: PlaybackMode;
}

/** The frame to show, and whether playing once has reached its end. */
export interface PlaybackPosition {
	readonly frame: number;
	readonly finished: boolean;
}

/**
 * Frame-accurate playback time. The frame shown is worked out from the time
 * since playback started, `floor(elapsed · fps)` frames on from the start,
 * never by adding up frame times, so slow or skipped animation frames never
 * make playback drift.
 */
export class PlaybackClock {
	constructor(
		private readonly settings: PlaybackSettings,
		private readonly startTime: number,
	) {}

	/** The position at `now`, a time on the same clock as the start time, in milliseconds. */
	positionAt(now: number): PlaybackPosition {
		const { fps, frameCount, startFrame, mode } = this.settings;
		const count = Math.max(AnimationDefaults.MinimumLayerLength, frameCount);
		const elapsedFrames = Math.floor((Math.max(0, now - this.startTime) * fps) / MILLISECONDS_PER_SECOND);
		const frame = startFrame + elapsedFrames;
		if (mode === PlaybackMode.Loop) return { frame: frame % count, finished: false };
		return frame >= count - 1 ? { frame: count - 1, finished: true } : { frame, finished: false };
	}
}
