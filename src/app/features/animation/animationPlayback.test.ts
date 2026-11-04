import { describe, expect, it } from 'vitest';
import { AnimationPlayer, BROWSER_FRAME_SCHEDULER, type FrameScheduler } from './animationPlayer';
import { PlaybackClock, PlaybackMode, type PlaybackSettings } from './playbackClock';

const SETTINGS: PlaybackSettings = { fps: 10, frameCount: 5, startFrame: 0, mode: PlaybackMode.Loop };

/** Animation frames the test fires at chosen times. */
class ManualScheduler implements FrameScheduler {
	time = 0;
	#callbacks = new Map<number, (time: number) => void>();
	#next = 1;

	request(callback: (time: number) => void): number {
		const handle = this.#next++;
		this.#callbacks.set(handle, callback);
		return handle;
	}

	cancel(handle: number): void {
		this.#callbacks.delete(handle);
	}

	now(): number {
		return this.time;
	}

	get pending(): number {
		return this.#callbacks.size;
	}

	fireAt(time: number): void {
		this.time = time;
		const callbacks = [...this.#callbacks.values()];
		this.#callbacks.clear();
		for (const callback of callbacks) callback(time);
	}
}

describe('playback clock', () => {
	it('shows floor(elapsed · fps) frames on from the start, at fixed times', () => {
		const clock = new PlaybackClock(SETTINGS, 1000);
		expect(clock.positionAt(1000).frame).toBe(0);
		expect(clock.positionAt(1099).frame).toBe(0);
		expect(clock.positionAt(1100).frame).toBe(1);
		expect(clock.positionAt(1399.9).frame).toBe(3);
		expect(clock.positionAt(900).frame).toBe(0);
	});

	it('does not drift: a frame time far ahead is exact', () => {
		const clock = new PlaybackClock({ ...SETTINGS, fps: 24, frameCount: 100_000 }, 0);
		// 1000 seconds at 24 fps is exactly frame 24000, however irregularly earlier frames arrived.
		expect(clock.positionAt(1_000_000).frame).toBe(24_000);
		expect(clock.positionAt(1_000_000 - 1).frame).toBe(23_999);
	});

	it('loops back to the first frame, starting from the playhead', () => {
		const clock = new PlaybackClock({ ...SETTINGS, startFrame: 3 }, 0);
		expect(clock.positionAt(100).frame).toBe(4);
		expect(clock.positionAt(200)).toEqual({ frame: 0, finished: false });
		expect(clock.positionAt(700).frame).toBe(0);
	});

	it('plays once, stopping on the last frame', () => {
		const clock = new PlaybackClock({ ...SETTINGS, mode: PlaybackMode.Once }, 0);
		expect(clock.positionAt(300)).toEqual({ frame: 3, finished: false });
		expect(clock.positionAt(400)).toEqual({ frame: 4, finished: true });
		expect(clock.positionAt(5000)).toEqual({ frame: 4, finished: true });
	});
});

describe('animation player', () => {
	it('shows each new frame once, on animation frames', () => {
		const scheduler = new ManualScheduler();
		const shown: number[] = [];
		const player = new AnimationPlayer((frame) => shown.push(frame), scheduler);
		const states: boolean[] = [];
		player.onPlayingChange((playing) => states.push(playing));
		player.play(SETTINGS);
		expect(player.playing).toBe(true);
		scheduler.fireAt(16);
		scheduler.fireAt(110);
		scheduler.fireAt(130);
		scheduler.fireAt(350);
		expect(shown).toEqual([1, 3]);
		player.stop();
		expect(player.playing).toBe(false);
		expect(scheduler.pending).toBe(0);
		expect(states).toEqual([true, false]);
		player.stop();
		expect(states).toEqual([true, false]);
	});

	it('stops by itself after playing once', () => {
		const scheduler = new ManualScheduler();
		const shown: number[] = [];
		const player = new AnimationPlayer((frame) => shown.push(frame), scheduler);
		player.play({ ...SETTINGS, mode: PlaybackMode.Once, startFrame: 2 });
		scheduler.fireAt(250);
		expect(shown).toEqual([4]);
		expect(player.playing).toBe(false);
		scheduler.fireAt(1000);
		expect(shown).toEqual([4]);
	});

	it('plays once from the first frame when started on the last', () => {
		const scheduler = new ManualScheduler();
		const shown: number[] = [];
		const player = new AnimationPlayer((frame) => shown.push(frame), scheduler);
		player.play({ ...SETTINGS, mode: PlaybackMode.Once, startFrame: 4 });
		scheduler.fireAt(0);
		expect(shown).toEqual([0]);
	});

	it('toggles between playing and stopped', () => {
		const scheduler = new ManualScheduler();
		const player = new AnimationPlayer(() => undefined, scheduler);
		player.toggle(SETTINGS);
		expect(player.playing).toBe(true);
		player.play(SETTINGS);
		expect(scheduler.pending).toBe(1);
		player.toggle(SETTINGS);
		expect(player.playing).toBe(false);
	});
});

describe('browser frame scheduler', () => {
	it('uses the browser’s animation frames and clock', () => {
		const handle = BROWSER_FRAME_SCHEDULER.request(() => undefined);
		expect(typeof handle).toBe('number');
		BROWSER_FRAME_SCHEDULER.cancel(handle);
		expect(BROWSER_FRAME_SCHEDULER.now()).toBeGreaterThanOrEqual(0);
	});
});
