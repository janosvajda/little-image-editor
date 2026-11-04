import { ColorPalette } from '../../core/document/colorPalette';
import { canvasContext } from '../../shared/dom/domHelpers';
import { renderContentLayers } from '../annotations/annotationRenderer';
import type { AnnotationState } from '../annotations/annotationTypes';
import { presentFrame, timelineLength } from './frameEvaluation';

/** How many frames onion skin shows on each side of the playhead. */
export const ONION_SKIN_FRAMES_BEFORE = 2;
export const ONION_SKIN_FRAMES_AFTER = 2;
/** The opacity of the nearest frame; each frame further away is fainter by the same step. */
const ONION_SKIN_NEAREST_OPACITY = 0.4;
/** Earlier frames are tinted one colour and later frames another, as in Flash. */
export const OnionSkinTint = { Before: ColorPalette.Crimson, After: ColorPalette.CornflowerBlue } as const;
const Composite = { Normal: 'source-over', Tint: 'source-atop' } as const satisfies Readonly<Record<string, GlobalCompositeOperation>>;
const ONION_SKIN_CLASS = 'onion-skin-canvas';

/** One frame onion skin shows: how far from the playhead, and how it is drawn. */
export interface OnionSkinFrame {
	readonly frame: number;
	readonly tint: string;
	readonly opacity: number;
}

/** The frames around the playhead onion skin shows, farthest first so the nearest are drawn on top. */
export function onionSkinFrames(playhead: number, frameCount: number): OnionSkinFrame[] {
	const frames: OnionSkinFrame[] = [];
	const fade = (distance: number, count: number) => (ONION_SKIN_NEAREST_OPACITY * (count - distance + 1)) / count;
	for (let distance = ONION_SKIN_FRAMES_BEFORE; distance >= 1; distance--)
		if (playhead - distance >= 0) frames.push({ frame: playhead - distance, tint: OnionSkinTint.Before, opacity: fade(distance, ONION_SKIN_FRAMES_BEFORE) });
	for (let distance = ONION_SKIN_FRAMES_AFTER; distance >= 1; distance--)
		if (playhead + distance < frameCount) frames.push({ frame: playhead + distance, tint: OnionSkinTint.After, opacity: fade(distance, ONION_SKIN_FRAMES_AFTER) });
	return frames;
}

/**
 * The frames before and after the playhead, tinted and faded, drawn on a
 * surface of their own beneath the layers so the current frame stays clear.
 */
export class OnionSkinCanvas {
	readonly canvas = document.createElement('canvas');
	readonly #frame = document.createElement('canvas');

	constructor(private readonly baseCanvas: HTMLCanvasElement) {
		this.canvas.className = ONION_SKIN_CLASS;
		this.canvas.setAttribute('aria-hidden', 'true');
	}

	/** Sizes the surface to the document. */
	resize(width: number, height: number): void {
		this.canvas.width = width;
		this.canvas.height = height;
		this.#frame.width = width;
		this.#frame.height = height;
	}

	/** Draws the frames around the playhead of an animated state; clears for none. */
	render(state: Readonly<AnnotationState> | null): void {
		const context = canvasContext(this.canvas);
		context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		const animation = state?.animation;
		if (!state || !animation) return;
		const frameContext = canvasContext(this.#frame);
		for (const { frame, tint, opacity } of onionSkinFrames(animation.playhead, timelineLength(animation))) {
			frameContext.globalCompositeOperation = Composite.Normal;
			frameContext.clearRect(0, 0, this.#frame.width, this.#frame.height);
			renderContentLayers(frameContext, this.baseCanvas, presentFrame({ ...state, animation: { ...animation, playhead: frame } }));
			frameContext.globalCompositeOperation = Composite.Tint;
			frameContext.fillStyle = tint;
			frameContext.fillRect(0, 0, this.#frame.width, this.#frame.height);
			context.globalAlpha = opacity;
			context.drawImage(this.#frame, 0, 0);
		}
		context.globalAlpha = 1;
		frameContext.globalCompositeOperation = Composite.Normal;
	}
}
