import type { AnnotationObject, AnnotationState, ContentLayer } from '../annotations/annotationTypes';
import { itemsInLayerOrder } from '../annotations/contentLayerStructure';
import { AnimationDefaults, type AnimationTimeline, type Keyframe, type LayerTimeline } from './animationTypes';
import { interpolateItem, tweenProgress } from './motionTween';

/**
 * What a timeline shows at a frame. A layer shows its active keyframe, the
 * last one at or before the frame, until its length runs out. Inside a
 * motion tween, items kept on the next keyframe are tweened towards it;
 * items only on one of the two keyframes show unchanged on their own
 * keyframe's frames only.
 */

/** The index of the layer's keyframe active at `frame`; -1 before its first or past its end. */
export function activeKeyframeIndex(layer: LayerTimeline, frame: number): number {
	if (frame < AnimationDefaults.FirstFrame || frame >= layer.length) return -1;
	for (let index = layer.keyframes.length - 1; index >= 0; index--) if (layer.keyframes[index]!.frame <= frame) return index;
	return -1;
}

/** The layer's keyframe active at `frame`, or null when it shows nothing there. */
export function activeKeyframe(layer: LayerTimeline, frame: number): Keyframe | null {
	return layer.keyframes[activeKeyframeIndex(layer, frame)] ?? null;
}

/** The layer's keyframe at exactly `frame`, or null when that frame is not a keyframe. */
export function keyframeAt(layer: LayerTimeline, frame: number): Keyframe | null {
	return layer.keyframes.find((keyframe) => keyframe.frame === frame) ?? null;
}

/** The keyframe following the one at `index`, which a tween from it ends on. */
export function nextKeyframe(layer: LayerTimeline, index: number): Keyframe | null {
	return layer.keyframes[index + 1] ?? null;
}

/** Whether `frame` lies inside a motion tween, after its keyframe and before the next. */
export function isTweenedFrame(layer: LayerTimeline, frame: number): boolean {
	const index = activeKeyframeIndex(layer, frame);
	const keyframe = layer.keyframes[index];
	return Boolean(keyframe?.tween && keyframe.frame < frame && nextKeyframe(layer, index));
}

/** The layer's items at `frame`, bottom first, as copies the caller may change. */
export function layerItemsAt(layer: LayerTimeline, frame: number): AnnotationObject[] {
	const index = activeKeyframeIndex(layer, frame);
	const keyframe = layer.keyframes[index];
	if (!keyframe) return [];
	const next = nextKeyframe(layer, index);
	if (!keyframe.tween || !next || frame === keyframe.frame) return structuredClone([...keyframe.items]);
	const t = tweenProgress(frame, keyframe.frame, next.frame);
	const targets = new Map(next.items.map((item) => [item.id, item]));
	const tween = keyframe.tween;
	return keyframe.items.map((item) => {
		const target = targets.get(item.id);
		return target ? interpolateItem(item, target, tween, t) : structuredClone(item);
	});
}

/**
 * The frame the editor shows for the playhead. Past the timeline's end, where
 * the animation can be continued, it shows the last frame, so the drawing is
 * there to change rather than gone.
 */
export function shownFrame(timeline: AnimationTimeline): number {
	return Math.min(timeline.playhead, timelineLength(timeline) - 1);
}

/** How many frames the timeline has: as many as its longest layer. */
export function timelineLength(timeline: AnimationTimeline): number {
	return Math.max(AnimationDefaults.MinimumLayerLength, ...Object.values(timeline.layers).map(({ length }) => length));
}

/**
 * The state showing its timeline's playhead frame (`shownFrame`): each layer
 * holds what its timeline gives it there. A layer the timeline does not know
 * yet keeps its items. An item id is shown once, in the lowest layer that has it.
 */
export function presentFrame(state: AnnotationState): AnnotationState {
	const { animation } = state;
	if (!animation) return state;
	const currentItems = new Map(state.objects.map((item) => [item.id, item]));
	const frame = shownFrame(animation);
	const itemsById = new Map<string, AnnotationObject>();
	const layers: ContentLayer[] = state.layers.map((layer) => {
		const timeline = animation.layers[layer.id];
		const items = timeline ? layerItemsAt(timeline, frame) : itemsInLayerOrder([layer], currentItems);
		const shown = items.filter((item) => !itemsById.has(item.id));
		for (const item of shown) itemsById.set(item.id, item);
		return { ...layer, itemIds: shown.map(({ id }) => id) };
	});
	return { ...state, layers, objects: itemsInLayerOrder(layers, itemsById) };
}

/** Whether two values are the same plain data: equal numbers, strings and flags, arrays and objects alike, key order aside. */
export function sameData(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	const leftEntries = Object.entries(left).filter(([, value]) => value !== undefined);
	const rightRecord = right as Readonly<Record<string, unknown>>;
	const rightKeys = Object.keys(right).filter((key) => rightRecord[key] !== undefined);
	return leftEntries.length === rightKeys.length && leftEntries.every(([key, value]) => sameData(value, rightRecord[key]));
}
