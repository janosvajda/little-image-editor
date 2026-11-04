import { PlaybackClock, PlaybackMode, type PlaybackSettings } from './playbackClock';

/** Where animation frames come from: the browser's own, or a test's. */
export interface FrameScheduler {
	request(callback: (time: number) => void): number;
	cancel(handle: number): void;
	now(): number;
}

export const BROWSER_FRAME_SCHEDULER: FrameScheduler = {
	request: (callback) => requestAnimationFrame(callback),
	cancel: (handle) => cancelAnimationFrame(handle),
	now: () => performance.now(),
};

/**
 * Plays frames at the timeline's rate on the browser's animation frames,
 * showing each frame only when the clock reaches a new one.
 */
export class AnimationPlayer {
	readonly #listeners = new Set<(playing: boolean) => void>();
	#clock: PlaybackClock | null = null;
	#handle: number | null = null;
	#shownFrame: number | null = null;

	constructor(
		private readonly show: (frame: number) => void,
		private readonly scheduler: FrameScheduler = BROWSER_FRAME_SCHEDULER,
	) {}

	get playing(): boolean {
		return this.#clock !== null;
	}

	onPlayingChange(listener: (playing: boolean) => void): void {
		this.#listeners.add(listener);
	}

	/** Plays from the start frame; playing once from the last frame starts again from the first. */
	play(settings: PlaybackSettings): void {
		this.cancelFrame();
		const atEnd = settings.mode === PlaybackMode.Once && settings.startFrame >= settings.frameCount - 1;
		this.#clock = new PlaybackClock(atEnd ? { ...settings, startFrame: 0 } : settings, this.scheduler.now());
		this.#shownFrame = settings.startFrame;
		this.#handle = this.scheduler.request((time) => this.tick(time));
		this.emit();
	}

	stop(): void {
		if (!this.#clock) return;
		this.cancelFrame();
		this.#clock = null;
		this.#shownFrame = null;
		this.emit();
	}

	toggle(settings: PlaybackSettings): void {
		if (this.playing) this.stop();
		else this.play(settings);
	}

	private tick(time: number): void {
		const clock = this.#clock;
		if (!clock) return;
		const { frame, finished } = clock.positionAt(time);
		if (frame !== this.#shownFrame) {
			this.#shownFrame = frame;
			this.show(frame);
		}
		if (finished) this.stop();
		else this.#handle = this.scheduler.request((next) => this.tick(next));
	}

	private cancelFrame(): void {
		if (this.#handle !== null) this.scheduler.cancel(this.#handle);
		this.#handle = null;
	}

	private emit(): void {
		this.#listeners.forEach((listener) => listener(this.playing));
	}
}
