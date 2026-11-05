import type { CanvasDocument } from '../../../core/document/imageDocument';
import { Numeric } from '../../../shared/math/numericConstants';
import { canvasContext } from '../../../shared/dom/domHelpers';
import type { AnnotationObject, AnnotationState } from '../../annotations/annotationTypes';
import { itemsInLayerOrder } from '../../annotations/contentLayerStructure';
import { layerAppearance } from '../../layers/layerAppearance';
import { itemSvgDocument } from '../../files/svgExport';
import { importItemSvg } from '../../files/svgImport';
import { type AnimationTimeline, Ease, type Keyframe, type Tween } from '../animationTypes';
import { timelineLength } from '../frameEvaluation';
import { createTimeline } from '../timelineModel';
import { ANIMATION_FORMAT_ID, ANIMATION_FORMAT_VERSION, roundFileNumber } from './animationFileFormat';
import { type AnimationFile, type AnimKeyframe, type AnimLayer, type FileTween, type Rgba, animationFileSchema } from './animationSchema';
import { fileItem, type ItemConversionStage } from './itemConversion';

/** Something a saved file does not keep as the editor shows it, said before saving. */
export const AnimationWriteWarning = {
	/** Pixels painted on the stage itself, such as by an image effect, are not kept: an animation keeps its layers. */
	StagePixels: 'stagePixels',
} as const;
export type AnimationWriteWarning = (typeof AnimationWriteWarning)[keyof typeof AnimationWriteWarning];

export interface AnimationWriteResult {
	readonly file: AnimationFile;
	readonly warnings: readonly AnimationWriteWarning[];
}

const RGBA_CHANNELS = 4;
const JSON_INDENT = 2;

/**
 * The document as an animation file. Each item is first read back from the
 * editing data it is kept with, so what the file says of it is exactly what
 * opening the file gives the editor again: saving, opening and saving again
 * writes the same bytes.
 */
export async function writeAnimationFile(documentModel: CanvasDocument, state: Readonly<AnnotationState>): Promise<AnimationWriteResult> {
	const itemsById = new Map(state.objects.map((item) => [item.id, item]));
	const timeline: AnimationTimeline = state.animation ?? createTimeline(state.layers.map((layer) => ({ layer, items: itemsInLayerOrder([layer], itemsById) })));
	const stage: ItemConversionStage = { canvas: documentModel.canvas, width: documentModel.width, height: documentModel.height };
	const background = stageBackground(documentModel.canvas);
	const layers: AnimLayer[] = [];
	for (const layer of state.layers) {
		const layerTimeline = timeline.layers[layer.id];
		if (!layerTimeline) continue;
		const { opacity, blendMode } = layerAppearance(layer);
		const keyframes: AnimKeyframe[] = [];
		for (const keyframe of layerTimeline.keyframes) keyframes.push(await fileKeyframe(keyframe, documentModel, stage));
		layers.push({ id: layer.id, name: layer.name, visible: layer.visible !== false, locked: layer.locked === true, opacity, blendMode, length: layerTimeline.length, keyframes });
	}
	const file = animationFileSchema.parse({
		format: ANIMATION_FORMAT_ID,
		version: ANIMATION_FORMAT_VERSION,
		stage: { width: documentModel.width, height: documentModel.height, background: background.color, fps: timeline.fps, frames: timelineLength(timeline) },
		library: [],
		timeline: { layers, labels: [] },
	});
	return { file, warnings: background.uniform ? [] : [AnimationWriteWarning.StagePixels] };
}

async function fileKeyframe(keyframe: Keyframe, documentModel: CanvasDocument, stage: ItemConversionStage): Promise<AnimKeyframe> {
	const items = [];
	for (const item of keyframe.items) items.push(await keptItem(item, documentModel, stage));
	return { frame: keyframe.frame, items, tween: keyframe.tween && fileTween(keyframe.tween) };
}

/** An item with its editing data, described as that data reads back. */
async function keptItem(item: AnnotationObject, documentModel: CanvasDocument, stage: ItemConversionStage) {
	const editor = itemSvgDocument(documentModel, item);
	const kept = (await importItemSvg(editor)) ?? item;
	return fileItem(kept, stage, editor);
}

function fileTween(tween: Tween): FileTween {
	const ease = tween.ease.kind === Ease.Custom ? { kind: tween.ease.kind, points: [...tween.ease.points] as [number, number, number, number] } : { kind: tween.ease.kind };
	return { kind: tween.kind, ease, rotate: tween.rotate, extraTurns: tween.extraTurns };
}

/** The stage's colour, transparent as none, and whether every pixel of it is that colour. */
function stageBackground(canvas: HTMLCanvasElement): { color: Rgba | null; uniform: boolean } {
	const { data } = canvasContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
	const first = Array.from(data.subarray(0, RGBA_CHANNELS));
	let uniform = true;
	for (let index = RGBA_CHANNELS; index < data.length && uniform; index += RGBA_CHANNELS)
		uniform = first.every((channel, offset) => data[index + offset] === channel);
	const [red = 0, green = 0, blue = 0, alpha = 0] = first.map((channel) => roundFileNumber(channel / Numeric.ByteMaximum));
	return { color: alpha === 0 ? null : [red, green, blue, alpha], uniform };
}

/**
 * The file as its text: keys in the order the schema names them, numbers
 * rounded to `FILE_NUMBER_PRECISION` places, indented, ending in a newline.
 */
export function serializeAnimationFile(file: AnimationFile): string {
	return `${JSON.stringify(file, (_key, value: unknown) => (typeof value === 'number' ? roundFileNumber(value) : value), JSON_INDENT)}\n`;
}
