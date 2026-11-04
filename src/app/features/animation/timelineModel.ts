import type { Point } from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import type { AnnotationObject, ContentLayer } from '../annotations/annotationTypes';
import { AnimationDefaults, type AnimationTimeline, defaultMotionTween, type Keyframe, type LayerTimeline, type Tween } from './animationTypes';
import { activeKeyframeIndex, isTweenedFrame, keyframeAt, layerItemsAt, nextKeyframe, sameData, shownFrame, timelineLength } from './frameEvaluation';

/**
 * Timeline edits as pure functions, in the spirit of Flash. Each returns a
 * new timeline, or the same one when the edit changes nothing, so a caller
 * records an undo step only for a real change.
 */

/** How a change made with the tools on a frame that is not a keyframe is kept. */
export const EditMode = {
	/**
	 * The change is a new pose: a keyframe at the playhead, with a motion tween
	 * from the pose before, so the frames between are made by themselves.
	 */
	AutoAnimate: 'autoAnimate',
	/** The change is to the keyframe the frame shows, as in Flash. */
	Hold: 'hold',
} as const;
export type EditMode = (typeof EditMode)[keyof typeof EditMode];

/** What a new keyframe starts with. */
export const KeyframeContent = {
	/** What the layer shows at that frame, tweened values included (F6). */
	Copy: 'copy',
	/** Nothing (F7). */
	Blank: 'blank',
} as const;
export type KeyframeContent = (typeof KeyframeContent)[keyof typeof KeyframeContent];

/** Copied frames: one keyframe's content and tween, and the layer it came from. */
export interface KeyframeClip {
	readonly layerId: string;
	readonly items: readonly AnnotationObject[];
	readonly tween: Tween | null;
}

/** A layer's content as it is at one frame: its id and items, bottom first. */
export interface LayerContent {
	readonly layer: Pick<ContentLayer, 'id'>;
	readonly items: readonly AnnotationObject[];
}

/** A timeline of one frame, each layer holding its current items on a keyframe at frame 0. */
export function createTimeline(content: readonly LayerContent[], fps: number = AnimationDefaults.Fps): AnimationTimeline {
	return {
		fps: clampFps(fps),
		playhead: AnimationDefaults.FirstFrame,
		layers: Object.fromEntries(content.map(({ layer, items }) => [layer.id, firstKeyframeLayer(items, AnimationDefaults.MinimumLayerLength)])),
	};
}

/**
 * Moves the playhead. As in Flash, it may stand past the last frame, where
 * nothing shows, so a keyframe or frames can be added there.
 */
export function withPlayhead(timeline: AnimationTimeline, frame: number): AnimationTimeline {
	const playhead = clampFrame(frame, AnimationDefaults.MaximumFrames - 1);
	return playhead === timeline.playhead ? timeline : { ...timeline, playhead };
}

/** Moves every keyframe's items by `delta`, as a document crop moves the items it keeps. */
export function translateTimeline(timeline: AnimationTimeline, delta: Point): AnimationTimeline {
	const layers = Object.entries(timeline.layers).map(([layerId, layer]): [string, LayerTimeline] => [
		layerId,
		{
			...layer,
			keyframes: layer.keyframes.map((keyframe) => ({
				...keyframe,
				items: keyframe.items.map((item) => {
					const moved = structuredClone(item);
					genericShape(moved).move(delta);
					return moved;
				}),
			})),
		},
	]);
	return { ...timeline, layers: Object.fromEntries(layers) };
}

/** Sets how many frames play each second. */
export function withFps(timeline: AnimationTimeline, fps: number): AnimationTimeline {
	const clamped = clampFps(fps);
	return clamped === timeline.fps ? timeline : { ...timeline, fps: clamped };
}

/**
 * Adds a keyframe at `frame`: a copy of what the layer shows there, or a
 * blank one. Past the layer's end, the layer is extended to it and a copy
 * takes the last frame's content. Inside a motion tween the new keyframe
 * splits it, and both halves keep the tween.
 */
export function insertKeyframe(timeline: AnimationTimeline, layerId: string, frame: number, content: KeyframeContent): AnimationTimeline {
	const layer = timeline.layers[layerId];
	if (!layer || !isFrame(frame) || keyframeAt(layer, frame)) return timeline;
	const source = Math.min(frame, layer.length - 1);
	const items = content === KeyframeContent.Copy ? layerItemsAt(layer, source) : [];
	const index = activeKeyframeIndex(layer, source);
	const tween = isTweenedFrame(layer, frame) ? (layer.keyframes[index]?.tween ?? null) : null;
	return withLayer(timeline, layerId, placeKeyframe(layer, { frame, items, tween }));
}

/**
 * Adds a frame (F5). Past the layer's end, the layer is extended to `frame`,
 * holding its last keyframe; inside it, a frame is added after `frame` and
 * later keyframes move one frame on.
 */
export function insertFrame(timeline: AnimationTimeline, layerId: string, frame: number): AnimationTimeline {
	const layer = timeline.layers[layerId];
	if (!layer || !isFrame(frame) || frame + 1 > AnimationDefaults.MaximumFrames) return timeline;
	if (frame >= layer.length) return withLayer(timeline, layerId, { ...layer, length: frame + 1 });
	return withLayer(timeline, layerId, {
		length: layer.length + 1,
		keyframes: layer.keyframes.map((keyframe) => (keyframe.frame > frame ? { ...keyframe, frame: keyframe.frame + 1 } : keyframe)),
	});
}

/**
 * Removes the frame at `frame` (Shift+F5): later keyframes move one frame
 * back. A keyframe lasting that one frame goes with it. A layer keeps at
 * least one frame.
 */
export function removeFrame(timeline: AnimationTimeline, layerId: string, frame: number): AnimationTimeline {
	const layer = timeline.layers[layerId];
	if (!layer || !isFrame(frame) || frame >= layer.length || layer.length <= AnimationDefaults.MinimumLayerLength) return timeline;
	const index = layer.keyframes.findIndex((keyframe) => keyframe.frame === frame);
	const spansOneFrame = index !== -1 && (nextKeyframe(layer, index)?.frame ?? layer.length) === frame + 1;
	const keyframes = layer.keyframes
		.filter((_keyframe, keyframeIndex) => !(spansOneFrame && keyframeIndex === index))
		.map((keyframe) => (keyframe.frame > frame ? { ...keyframe, frame: keyframe.frame - 1 } : keyframe));
	return withLayer(timeline, layerId, { length: layer.length - 1, keyframes });
}

/**
 * Turns the keyframe at `frame` back into a frame of the keyframe before it
 * (Shift+F6). The first keyframe stays, since a layer starts with one.
 */
export function clearKeyframe(timeline: AnimationTimeline, layerId: string, frame: number): AnimationTimeline {
	const layer = timeline.layers[layerId];
	if (!layer || frame <= AnimationDefaults.FirstFrame || !keyframeAt(layer, frame)) return timeline;
	return withLayer(timeline, layerId, { ...layer, keyframes: layer.keyframes.filter((keyframe) => keyframe.frame !== frame) });
}

/** Gives the keyframe active at `frame` a tween, or removes its tween with `null`. */
export function setTween(timeline: AnimationTimeline, layerId: string, frame: number, tween: Tween | null): AnimationTimeline {
	const layer = timeline.layers[layerId];
	const index = layer ? activeKeyframeIndex(layer, frame) : -1;
	const keyframe = layer?.keyframes[index];
	if (!layer || !keyframe || sameData(keyframe.tween, tween)) return timeline;
	return withLayer(timeline, layerId, { ...layer, keyframes: layer.keyframes.map((current, keyframeIndex) => (keyframeIndex === index ? { ...current, tween } : current)) });
}

/** Copies the keyframe active at `frame`: what it holds and its tween. */
export function copyKeyframe(timeline: AnimationTimeline, layerId: string, frame: number): KeyframeClip | null {
	const layer = timeline.layers[layerId];
	const keyframe = layer ? layer.keyframes[activeKeyframeIndex(layer, frame)] : undefined;
	return keyframe ? { layerId, items: structuredClone([...keyframe.items]), tween: keyframe.tween } : null;
}

/**
 * Puts copied frames at `frame` as a keyframe, in place of one there. On
 * another layer the items take new ids, as an id belongs to one layer; on
 * their own layer they keep them, so they can tween with its other keyframes.
 */
export function pasteKeyframe(timeline: AnimationTimeline, layerId: string, frame: number, clip: KeyframeClip, newId: () => string): AnimationTimeline {
	const layer = timeline.layers[layerId];
	if (!layer || !isFrame(frame) || frame >= AnimationDefaults.MaximumFrames) return timeline;
	const items = clip.layerId === layerId ? structuredClone([...clip.items]) : clip.items.map((item) => ({ ...structuredClone(item), id: newId() }));
	const keyframes = layer.keyframes.filter((keyframe) => keyframe.frame !== frame);
	return withLayer(timeline, layerId, placeKeyframe({ ...layer, keyframes }, { frame, items, tween: clip.tween }));
}

/**
 * Folds the content shown at the playhead back into the timeline after an
 * edit. A layer the timeline does not know yet gets a keyframe at frame 0
 * lasting the whole timeline, as a new Flash layer does; a removed layer's
 * frames go. A change on a keyframe changes that keyframe. A change inside a
 * motion tween becomes a keyframe of its own at the playhead, as does a
 * change past the layer's end, which extends the layer. A change on a frame
 * that holds a keyframe is a new tweened pose with `EditMode.AutoAnimate`,
 * and a change to the held keyframe with `EditMode.Hold`.
 */
export function reconcileTimeline(timeline: AnimationTimeline, content: readonly LayerContent[], newId: () => string, mode: EditMode = EditMode.Hold): AnimationTimeline {
	const length = timelineLength(timeline);
	const layers: Record<string, LayerTimeline> = {};
	for (const { layer, items } of content) {
		const current = timeline.layers[layer.id];
		layers[layer.id] = current ? reconcileLayer(current, timeline.playhead, shownFrame(timeline), items, mode) : firstKeyframeLayer(items, length);
	}
	const reconciled = keepLayersToEnd(timeline, { ...timeline, layers: separateSharedIds(layers, content, newId) });
	return sameData(reconciled.layers, timeline.layers) ? timeline : reconciled;
}

/** A layer after a change at `frame`, which showed what the layer has at `shown`. */
function reconcileLayer(layer: LayerTimeline, frame: number, shown: number, items: readonly AnnotationObject[], mode: EditMode): LayerTimeline {
	if (sameData(layerItemsAt(layer, shown), items)) return layer;
	const index = activeKeyframeIndex(layer, Math.min(frame, layer.length - 1));
	const keyframe = layer.keyframes[index];
	const pose = { frame, items: [...items], tween: null };
	if (!keyframe) return placeKeyframe(layer, pose);
	if (keyframe.frame === frame) return withKeyframe(layer, index, { ...keyframe, items: [...items] });
	if (isTweenedFrame(layer, frame)) return placeKeyframe(layer, { ...pose, tween: keyframe.tween });
	if (mode === EditMode.AutoAnimate) return placeKeyframe(withKeyframe(layer, index, { ...keyframe, tween: keyframe.tween ?? defaultMotionTween() }), pose);
	if (frame >= layer.length) return placeKeyframe(layer, pose);
	return withKeyframe(layer, index, { ...keyframe, items: [...items] });
}

function withKeyframe(layer: LayerTimeline, index: number, keyframe: Keyframe): LayerTimeline {
	return { ...layer, keyframes: layer.keyframes.map((current, keyframeIndex) => (keyframeIndex === index ? keyframe : current)) };
}

/**
 * The timeline after an edit made it longer, its layers that lasted to its
 * old end lasting to its new one, so what stays on the stage stays while the
 * rest is animated.
 */
export function keepLayersToEnd(before: AnimationTimeline, after: AnimationTimeline): AnimationTimeline {
	const oldEnd = timelineLength(before);
	const newEnd = timelineLength(after);
	if (newEnd <= oldEnd) return after;
	const layers = Object.fromEntries(
		Object.entries(after.layers).map(([layerId, layer]) => [layerId, layer.length === oldEnd && before.layers[layerId]?.length === oldEnd ? { ...layer, length: newEnd } : layer]),
	);
	return { ...after, layers };
}

/**
 * Keeps each item id to one layer. An item moved to another layer keeps its
 * id there, where it is shown; the keyframes it left behind on its old layer
 * give their copy a new id, the same on each of them so they still tween.
 */
function separateSharedIds(layers: Record<string, LayerTimeline>, content: readonly LayerContent[], newId: () => string): Record<string, LayerTimeline> {
	const shownIn = new Map(content.flatMap(({ layer, items }) => items.map((item) => [item.id, layer.id] as const)));
	return Object.fromEntries(
		Object.entries(layers).map(([layerId, layer]) => {
			const renamed = new Map<string, string>();
			const rename = (item: AnnotationObject): AnnotationObject => {
				const owner = shownIn.get(item.id);
				if (owner === undefined || owner === layerId) return item;
				let id = renamed.get(item.id);
				if (id === undefined) renamed.set(item.id, (id = newId()));
				return { ...item, id };
			};
			const keyframes = layer.keyframes.map((keyframe) => ({ ...keyframe, items: keyframe.items.map(rename) }));
			return [layerId, renamed.size ? { ...layer, keyframes } : layer];
		}),
	);
}

function firstKeyframeLayer(items: readonly AnnotationObject[], length: number): LayerTimeline {
	return { length, keyframes: [{ frame: AnimationDefaults.FirstFrame, items: [...items], tween: null }] };
}

/** The layer with a keyframe added in frame order, lengthened to reach it. */
function placeKeyframe(layer: LayerTimeline, keyframe: Keyframe): LayerTimeline {
	return {
		length: Math.max(layer.length, keyframe.frame + 1),
		keyframes: [...layer.keyframes, keyframe].sort((left, right) => left.frame - right.frame),
	};
}

function withLayer(timeline: AnimationTimeline, layerId: string, layer: LayerTimeline): AnimationTimeline {
	return { ...timeline, layers: { ...timeline.layers, [layerId]: layer } };
}

function isFrame(frame: number): boolean {
	return Number.isInteger(frame) && frame >= AnimationDefaults.FirstFrame && frame < AnimationDefaults.MaximumFrames;
}

function clampFrame(frame: number, last: number): number {
	return Number.isFinite(frame) ? Math.min(Math.max(AnimationDefaults.FirstFrame, Math.round(frame)), last) : AnimationDefaults.FirstFrame;
}

function clampFps(fps: number): number {
	return Number.isFinite(fps) ? Math.min(AnimationDefaults.MaximumFps, Math.max(AnimationDefaults.MinimumFps, Math.round(fps))) : AnimationDefaults.Fps;
}
