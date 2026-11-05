import { ColorPalette } from '../../../core/document/colorPalette';
import type { CanvasDocument } from '../../../core/document/imageDocument';
import { canvasContext } from '../../../shared/dom/domHelpers';
import type { AnnotationDocument } from '../../annotations/annotationDocument';
import type { ExportOptions } from '../../files/exportOptions';
import { type AnimationFrames, documentFrames, gifTiming } from './animationFrames';
import { AnimationExportFormat } from './animationExportFormats';
import { encodeGif } from './gifEncoder';
import { BROWSER_MEDIA, type MediaEnvironment, recordWebm, supportedWebmType } from './webmRecorder';

/** A video has no see-through pixels; without a chosen colour its frames are drawn over white. */
const DEFAULT_VIDEO_BACKGROUND = ColorPalette.White;

/**
 * Exports the open animation to play anywhere: as an animated GIF, encoded
 * here frame by frame, or as a WebM video recorded by the browser.
 */
export class AnimationExporter {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly objects: Pick<AnnotationDocument, 'state'>,
		private readonly media: MediaEnvironment = BROWSER_MEDIA,
	) {}

	/** Whether this browser can export the format. */
	supports(format: AnimationExportFormat): boolean {
		return format === AnimationExportFormat.Gif || supportedWebmType(this.media) !== null;
	}

	export(format: AnimationExportFormat, options: ExportOptions): Promise<Blob> {
		const frames = documentFrames(this.documentModel, this.objects.state);
		const background = options.background ?? null;
		if (format === AnimationExportFormat.Gif) return Promise.resolve(gifBlob(frames, options.scale, background));
		return recordWebm(frames, options.scale, background ?? DEFAULT_VIDEO_BACKGROUND, this.media);
	}
}

/** The frames as an animated GIF that loops, drawn at `scale`, see-through where nothing is drawn unless a background is given. */
function gifBlob(frames: AnimationFrames, scale: number, background: string | null): Blob {
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(frames.width * scale));
	canvas.height = Math.max(1, Math.round(frames.height * scale));
	const context = canvasContext(canvas, { willReadFrequently: true });
	const timed = gifTiming(frames.fps, frames.count).map(({ frame, delay }) => {
		frames.draw(context, frame, scale, background);
		return { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, delay };
	});
	const bytes = encodeGif(timed, { width: canvas.width, height: canvas.height, loop: true });
	return new Blob([bytes], { type: AnimationExportFormat.Gif });
}
