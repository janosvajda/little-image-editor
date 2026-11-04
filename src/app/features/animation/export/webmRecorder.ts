import type { AnimationFrames } from './animationFrames';
import { frameStart } from './animationFrames';

/** Codecs to record with, best first; the first the browser records is used. */
const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const;
const WEBM_TYPE = 'video/webm';
/** Each frame is handed to the recorder by the page, not at a rate of the stream's own. */
const FRAMES_ON_REQUEST = 0;

/** What recording needs from the browser, so a test can stand in for it. */
export interface MediaEnvironment {
	readonly MediaRecorder: typeof MediaRecorder | undefined;
	now(): number;
	wait(milliseconds: number): Promise<void>;
}

export const BROWSER_MEDIA: MediaEnvironment = {
	MediaRecorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
	now: () => performance.now(),
	wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds))),
};

/** The WebM type the browser records, or null where it records none. */
export function supportedWebmType(media: MediaEnvironment = BROWSER_MEDIA): string | null {
	const recorder = media.MediaRecorder;
	return recorder ? (WEBM_TYPES.find((type) => recorder.isTypeSupported(type)) ?? null) : null;
}

/**
 * Records the frames as a WebM video, as they play: each frame is drawn and
 * handed to the browser's recorder when the animation reaches it, timed from
 * the start, so the video keeps the animation's speed without drifting.
 */
export async function recordWebm(frames: AnimationFrames, scale: number, background: string, media: MediaEnvironment = BROWSER_MEDIA): Promise<Blob> {
	const type = supportedWebmType(media);
	const Recorder = media.MediaRecorder;
	if (!type || !Recorder) throw new Error('This browser cannot record WebM video.');
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(frames.width * scale));
	canvas.height = Math.max(1, Math.round(frames.height * scale));
	const context = canvas.getContext('2d');
	const stream = canvas.captureStream(FRAMES_ON_REQUEST);
	const [track] = stream.getVideoTracks() as CanvasCaptureMediaStreamTrack[];
	if (!context || !track) throw new Error('The animation could not be drawn for recording.');
	const recorder = new Recorder(stream, { mimeType: type });
	const chunks: Blob[] = [];
	recorder.addEventListener('dataavailable', (event) => {
		if (event.data.size) chunks.push(event.data);
	});
	const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve()));
	recorder.start();
	const start = media.now();
	for (let frame = 0; frame < frames.count; frame++) {
		await media.wait(start + frameStart(frame, frames.fps) - media.now());
		frames.draw(context, frame, scale, background);
		track.requestFrame();
	}
	// The last frame shows for its own length before the video ends.
	await media.wait(start + frameStart(frames.count, frames.fps) - media.now());
	recorder.stop();
	stream.getTracks().forEach((streamTrack) => streamTrack.stop());
	await stopped;
	return new Blob(chunks, { type: WEBM_TYPE });
}
