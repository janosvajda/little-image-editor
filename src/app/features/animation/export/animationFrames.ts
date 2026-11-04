import type { CanvasDocument } from '../../../core/document/imageDocument';
import { CoreLayerId } from '../../../core/layers/layerTypes';
import { renderContentLayers } from '../../annotations/annotationRenderer';
import type { AnnotationState } from '../../annotations/annotationTypes';
import { presentFrame, timelineLength } from '../frameEvaluation';

/** GIF counts time in hundredths of a second. */
export const GIF_TIME_UNITS_PER_SECOND = 100;
/** Browsers show a GIF frame shorter than this as if it were a tenth of a second, so no frame is made shorter. */
export const MINIMUM_GIF_DELAY = 2;
const MILLISECONDS_PER_SECOND = 1000;

/** One frame of an export: which animation frame, and how long it shows, in hundredths of a second. */
export interface TimedFrame {
	readonly frame: number;
	readonly delay: number;
}

/** What an export draws: the stage's frames, as the editor shows them. */
export interface AnimationFrames {
	readonly width: number;
	readonly height: number;
	readonly fps: number;
	readonly count: number;
	/** Draws frame `frame` at `scale`, over `background` when given, otherwise over nothing. */
	draw(context: CanvasRenderingContext2D, frame: number, scale: number, background: string | null): void;
}

/**
 * The open animation's frames, drawn as the editor draws them for export: the
 * stage, then the layers as they are at that frame, each as shown or hidden.
 * The document itself is left as it is.
 */
export function documentFrames(documentModel: CanvasDocument, state: Readonly<AnnotationState>): AnimationFrames {
	const animation = state.animation;
	return {
		width: documentModel.width,
		height: documentModel.height,
		fps: animation?.fps ?? 1,
		count: animation ? timelineLength(animation) : 1,
		draw(context, frame, scale, background) {
			context.save();
			context.clearRect(0, 0, context.canvas.width, context.canvas.height);
			context.scale(scale, scale);
			if (background) {
				context.fillStyle = background;
				context.fillRect(0, 0, documentModel.width, documentModel.height);
			}
			if (documentModel.layers.isVisible(CoreLayerId.Image)) context.drawImage(documentModel.canvas, 0, 0);
			if (documentModel.layers.isVisible(CoreLayerId.Objects))
				renderContentLayers(context, documentModel.canvas, animation ? presentFrame({ ...state, animation: { ...animation, playhead: frame } }) : state);
			context.restore();
		},
	};
}

/**
 * The frames a GIF shows, with how long each shows. Each frame starts when
 * the animation reaches it, rounded to GIF's hundredths, so the timing never
 * drifts; a frame that would show for less than `MINIMUM_GIF_DELAY` is left
 * out, its time going to the frame before.
 */
export function gifTiming(fps: number, count: number): TimedFrame[] {
	const startOf = (frame: number) => Math.round((frame * GIF_TIME_UNITS_PER_SECOND) / fps);
	const shown: number[] = [];
	for (let frame = 0; frame < count; frame++) {
		const previous = shown.at(-1);
		if (previous === undefined || startOf(frame) - startOf(previous) >= MINIMUM_GIF_DELAY) shown.push(frame);
	}
	return shown.map((frame, index) => ({ frame, delay: Math.max(MINIMUM_GIF_DELAY, startOf(shown[index + 1] ?? count) - startOf(frame)) }));
}

/** When frame `frame` starts, in milliseconds from the first. */
export function frameStart(frame: number, fps: number): number {
	return (frame * MILLISECONDS_PER_SECOND) / fps;
}
