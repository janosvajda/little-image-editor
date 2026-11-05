import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { type AnimationTimeline, defaultMotionTween, type Keyframe, type LayerTimeline } from './animationTypes';
import { activeKeyframeIndex, isTweenedFrame, layerItemsAt, presentFrame, sameData, timelineLength } from './frameEvaluation';
import {
	clearKeyframe,
	copyKeyframe,
	createTimeline,
	insertFrame,
	insertKeyframe,
	KeyframeContent,
	pasteKeyframe,
	reconcileTimeline,
	removeFrame,
	setTween,
	withFps,
	withPlayhead,
} from './timelineModel';

const LAYER = 'layer';

function box(id: string, x: number): ShapeAnnotation {
	return { id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x, y: 0, width: 10, height: 10 }, color: '#000000', width: 1, opacity: 1, fill: false };
}

function keyframe(frame: number, items: ShapeAnnotation[], tween: Keyframe['tween'] = null): Keyframe {
	return { frame, items, tween };
}

function timeline(layer: LayerTimeline, playhead = 0): AnimationTimeline {
	return { fps: 24, playhead, layers: { [LAYER]: layer } };
}

function frames(result: AnimationTimeline): number[] {
	return result.layers[LAYER]!.keyframes.map(({ frame }) => frame);
}

let counter = 0;
const newId = () => `new-${++counter}`;

describe('keyframe insertion', () => {
	const base = timeline({ length: 10, keyframes: [keyframe(0, [box('a', 0)])] });

	it('copies what the layer shows into a new keyframe (F6)', () => {
		const result = insertKeyframe(base, LAYER, 4, KeyframeContent.Copy);
		expect(frames(result)).toEqual([0, 4]);
		expect(result.layers[LAYER]!.keyframes[1]!.items).toEqual([box('a', 0)]);
		expect(result.layers[LAYER]!.length).toBe(10);
	});

	it('adds an empty keyframe (F7)', () => {
		const result = insertKeyframe(base, LAYER, 4, KeyframeContent.Blank);
		expect(result.layers[LAYER]!.keyframes[1]!.items).toEqual([]);
	});

	it('extends the layer to a keyframe past its end, copying its last frame', () => {
		const result = insertKeyframe(base, LAYER, 14, KeyframeContent.Copy);
		expect(result.layers[LAYER]!.length).toBe(15);
		expect(result.layers[LAYER]!.keyframes[1]!.items).toEqual([box('a', 0)]);
	});

	it('copies the tweened content and splits the tween, both halves keeping it', () => {
		const tweened = timeline({ length: 11, keyframes: [keyframe(0, [box('a', 0)], defaultMotionTween()), keyframe(10, [box('a', 100)])] });
		const result = insertKeyframe(tweened, LAYER, 5, KeyframeContent.Copy);
		const split = result.layers[LAYER]!.keyframes[1]!;
		expect((split.items[0] as ShapeAnnotation).rect.x).toBe(50);
		expect(split.tween).toEqual(defaultMotionTween());
	});

	it('changes nothing on an existing keyframe, an unknown layer or an invalid frame', () => {
		expect(insertKeyframe(base, LAYER, 0, KeyframeContent.Copy)).toBe(base);
		expect(insertKeyframe(base, 'missing', 3, KeyframeContent.Copy)).toBe(base);
		expect(insertKeyframe(base, LAYER, -1, KeyframeContent.Copy)).toBe(base);
		expect(insertKeyframe(base, LAYER, 1.5, KeyframeContent.Copy)).toBe(base);
	});
});

describe('frame insertion and removal', () => {
	const base = timeline({ length: 10, keyframes: [keyframe(0, [box('a', 0)]), keyframe(5, [])] });

	it('inserts a frame after the playhead frame, moving later keyframes on (F5)', () => {
		expect(frames(insertFrame(base, LAYER, 5))).toEqual([0, 5]);
		const inserted = insertFrame(base, LAYER, 2);
		expect(frames(inserted)).toEqual([0, 6]);
		expect(inserted.layers[LAYER]!.length).toBe(11);
	});

	it('extends the layer when inserting past its end', () => {
		const result = insertFrame(base, LAYER, 20);
		expect(result.layers[LAYER]!.length).toBe(21);
		expect(frames(result)).toEqual([0, 5]);
		expect(insertFrame(base, 'missing', 2)).toBe(base);
	});

	it('removes a frame, moving later keyframes back (Shift+F5)', () => {
		const result = removeFrame(base, LAYER, 2);
		expect(frames(result)).toEqual([0, 4]);
		expect(result.layers[LAYER]!.length).toBe(9);
	});

	it('removes a keyframe that lasted only the removed frame', () => {
		const short = timeline({ length: 10, keyframes: [keyframe(0, []), keyframe(3, []), keyframe(4, [])] });
		expect(frames(removeFrame(short, LAYER, 3))).toEqual([0, 3]);
		const last = timeline({ length: 5, keyframes: [keyframe(0, []), keyframe(4, [])] });
		expect(frames(removeFrame(last, LAYER, 4))).toEqual([0]);
	});

	it('keeps a longer keyframe when one of its frames goes', () => {
		expect(frames(removeFrame(base, LAYER, 5))).toEqual([0, 5]);
	});

	it('leaves the playhead where it is', () => {
		expect(removeFrame(timeline(base.layers[LAYER]!, 9), LAYER, 2).playhead).toBe(9);
	});

	it('never removes a layer’s last frame, nor frames past its end', () => {
		const single = timeline({ length: 1, keyframes: [keyframe(0, [])] });
		expect(removeFrame(single, LAYER, 0)).toBe(single);
		expect(removeFrame(base, LAYER, 12)).toBe(base);
	});
});

describe('clearing keyframes', () => {
	const base = timeline({ length: 10, keyframes: [keyframe(0, [box('a', 0)]), keyframe(5, [])] });

	it('turns a keyframe into a frame of the one before (Shift+F6)', () => {
		const result = clearKeyframe(base, LAYER, 5);
		expect(frames(result)).toEqual([0]);
		expect(layerItemsAt(result.layers[LAYER]!, 7)).toEqual([box('a', 0)]);
	});

	it('keeps the first keyframe and ignores frames that are not keyframes', () => {
		expect(clearKeyframe(base, LAYER, 0)).toBe(base);
		expect(clearKeyframe(base, LAYER, 3)).toBe(base);
		expect(clearKeyframe(base, 'missing', 5)).toBe(base);
	});
});

describe('tweens', () => {
	const base = timeline({ length: 10, keyframes: [keyframe(0, [box('a', 0)]), keyframe(8, [box('a', 80)])] });

	it('sets and removes the tween of the keyframe active at a frame', () => {
		const tweened = setTween(base, LAYER, 3, defaultMotionTween());
		expect(tweened.layers[LAYER]!.keyframes[0]!.tween).toEqual(defaultMotionTween());
		expect(setTween(tweened, LAYER, 3, defaultMotionTween())).toBe(tweened);
		expect(setTween(tweened, LAYER, 1, null).layers[LAYER]!.keyframes[0]!.tween).toBeNull();
		expect(setTween(base, 'missing', 1, null)).toBe(base);
		expect(setTween(base, LAYER, 30, defaultMotionTween())).toBe(base);
	});

	it('tweens items kept on both keyframes, and shows the others only on their own keyframe', () => {
		const layer: LayerTimeline = {
			length: 10,
			keyframes: [keyframe(0, [box('a', 0), box('only-first', 5)], defaultMotionTween()), keyframe(8, [box('a', 80), box('only-second', 9)])],
		};
		const ids = (frame: number) => layerItemsAt(layer, frame).map(({ id }) => id);
		expect(ids(0)).toEqual(['a', 'only-first']);
		expect(ids(4)).toEqual(['a', 'only-first']);
		expect((layerItemsAt(layer, 4)[0] as ShapeAnnotation).rect.x).toBe(40);
		expect((layerItemsAt(layer, 4)[1] as ShapeAnnotation).rect.x).toBe(5);
		expect(ids(7)).toEqual(['a', 'only-first']);
		expect(ids(8)).toEqual(['a', 'only-second']);
		expect(ids(9)).toEqual(['a', 'only-second']);
		expect(isTweenedFrame(layer, 4)).toBe(true);
		expect(isTweenedFrame(layer, 0)).toBe(false);
		expect(isTweenedFrame(layer, 9)).toBe(false);
	});

	it('holds a keyframe whose tween has no keyframe after it', () => {
		const layer: LayerTimeline = { length: 5, keyframes: [keyframe(0, [box('a', 0)], defaultMotionTween())] };
		expect(layerItemsAt(layer, 3)).toEqual([box('a', 0)]);
	});
});

describe('frame evaluation', () => {
	const layer: LayerTimeline = { length: 6, keyframes: [keyframe(2, [box('a', 0)])] };

	it('shows nothing before the first keyframe or past the layer’s end', () => {
		expect(activeKeyframeIndex(layer, 1)).toBe(-1);
		expect(layerItemsAt(layer, 1)).toEqual([]);
		expect(layerItemsAt(layer, 6)).toEqual([]);
		expect(layerItemsAt(layer, 5)).toEqual([box('a', 0)]);
	});

	it('is as long as its longest layer', () => {
		expect(timelineLength({ fps: 24, playhead: 0, layers: { one: layer, two: { length: 9, keyframes: [] } } })).toBe(9);
		expect(timelineLength({ fps: 24, playhead: 0, layers: {} })).toBe(1);
	});

	it('presents the playhead frame in the layers, each id once, and leaves unanimated states alone', () => {
		const state = {
			objects: [box('loose', 1)],
			layers: [
				{ id: 'one', name: 'One', itemIds: [] },
				{ id: 'two', name: 'Two', itemIds: [] },
				{ id: 'new', name: 'New', itemIds: ['loose'] },
			],
			nextStep: 1,
			animation: {
				fps: 24,
				playhead: 3,
				layers: {
					one: { length: 6, keyframes: [keyframe(0, [box('a', 0)])] },
					two: { length: 6, keyframes: [keyframe(0, [box('a', 7), box('b', 2)])] },
				},
			},
		};
		const presented = presentFrame(state);
		expect(presented.layers.map(({ itemIds }) => itemIds)).toEqual([['a'], ['b'], ['loose']]);
		expect(presented.objects.map(({ id }) => id)).toEqual(['a', 'b', 'loose']);
		const plain = { objects: [], layers: [], nextStep: 1 };
		expect(presentFrame(plain)).toBe(plain);
	});

	it('compares plain data regardless of key order and absent values', () => {
		expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
		expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
		expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
		expect(sameData([1], { 0: 1 })).toBe(false);
		expect(sameData(null, {})).toBe(false);
		expect(sameData('a', 'b')).toBe(false);
	});
});

describe('copying and pasting frames', () => {
	const base: AnimationTimeline = {
		fps: 24,
		playhead: 0,
		layers: { [LAYER]: { length: 4, keyframes: [keyframe(0, [box('a', 0)], defaultMotionTween())] }, other: { length: 4, keyframes: [keyframe(0, [])] } },
	};

	it('pastes into the same layer keeping ids, so the copy can tween', () => {
		const clip = copyKeyframe(base, LAYER, 2)!;
		const result = pasteKeyframe(base, LAYER, 6, clip, newId);
		expect(result.layers[LAYER]!.keyframes[1]).toEqual({ frame: 6, items: [box('a', 0)], tween: defaultMotionTween() });
		expect(result.layers[LAYER]!.length).toBe(7);
	});

	it('gives pasted items new ids on another layer and replaces a keyframe already there', () => {
		const clip = copyKeyframe(base, LAYER, 0)!;
		const result = pasteKeyframe(base, 'other', 0, clip, newId);
		const pasted = result.layers.other!.keyframes;
		expect(pasted).toHaveLength(1);
		expect(pasted[0]!.items[0]!.id).toMatch(/^new-/);
	});

	it('copies nothing where a layer shows nothing, and pastes nowhere invalid', () => {
		expect(copyKeyframe(base, LAYER, 9)).toBeNull();
		expect(copyKeyframe(base, 'missing', 0)).toBeNull();
		const clip = copyKeyframe(base, LAYER, 0)!;
		expect(pasteKeyframe(base, 'missing', 1, clip, newId)).toBe(base);
		expect(pasteKeyframe(base, LAYER, -2, clip, newId)).toBe(base);
	});
});

describe('timeline creation and settings', () => {
	it('starts with one frame holding every layer’s items', () => {
		const created = createTimeline([{ layer: { id: LAYER }, items: [box('a', 0)] }], 12);
		expect(created).toEqual({ fps: 12, playhead: 0, layers: { [LAYER]: { length: 1, keyframes: [keyframe(0, [box('a', 0)])] } } });
	});

	it('keeps fps and playhead within their ranges', () => {
		const created = createTimeline([{ layer: { id: LAYER }, items: [] }]);
		expect(created.fps).toBe(24);
		expect(withFps(created, 500).fps).toBe(120);
		expect(withFps(created, 0).fps).toBe(1);
		expect(withFps(created, Number.NaN).fps).toBe(24);
		expect(withFps(created, 24)).toBe(created);
		const long = timeline({ length: 10, keyframes: [keyframe(0, [])] });
		expect(withPlayhead(long, 4.4).playhead).toBe(4);
		// As in Flash, the playhead may stand past the last frame, to add frames there.
		expect(withPlayhead(long, 40).playhead).toBe(40);
		expect(withPlayhead(long, 1e9).playhead).toBe(9999);
		expect(withPlayhead(long, -3)).toBe(long);
		expect(withPlayhead(long, Number.NaN)).toBe(long);
	});
});

describe('reconciling edits', () => {
	const base = timeline({ length: 10, keyframes: [keyframe(0, [box('a', 0)], defaultMotionTween()), keyframe(8, [box('a', 80)])] });

	it('changes nothing when the shown content is unchanged', () => {
		const shown = layerItemsAt(base.layers[LAYER]!, 0);
		expect(reconcileTimeline(base, [{ layer: { id: LAYER }, items: shown }], newId)).toBe(base);
	});

	it('writes an edit on a keyframe into that keyframe', () => {
		const result = reconcileTimeline(base, [{ layer: { id: LAYER }, items: [box('a', 3)] }], newId);
		expect(result.layers[LAYER]!.keyframes[0]!.items).toEqual([box('a', 3)]);
	});

	it('turns an edit inside a tween into a keyframe of its own, keeping the tween', () => {
		const result = reconcileTimeline({ ...base, playhead: 4 }, [{ layer: { id: LAYER }, items: [box('a', 3)] }], newId);
		expect(frames(result)).toEqual([0, 4, 8]);
		expect(result.layers[LAYER]!.keyframes[1]!.tween).toEqual(defaultMotionTween());
	});

	it('extends a layer for content drawn past its end', () => {
		const result = reconcileTimeline({ ...base, playhead: 12 }, [{ layer: { id: LAYER }, items: [box('b', 1)] }], newId);
		expect(result.layers[LAYER]!.length).toBe(13);
		expect(frames(result)).toEqual([0, 8, 12]);
	});

	it('gives new layers a keyframe lasting the timeline and forgets removed ones', () => {
		const result = reconcileTimeline(base, [{ layer: { id: 'fresh' }, items: [box('n', 0)] }], newId);
		expect(Object.keys(result.layers)).toEqual(['fresh']);
		expect(result.layers.fresh).toEqual({ length: 10, keyframes: [keyframe(0, [box('n', 0)])] });
	});

	it('renames the keyframes left behind by an item moved to another layer', () => {
		const two: AnimationTimeline = { ...base, layers: { ...base.layers, other: { length: 10, keyframes: [keyframe(0, [])] } } };
		const result = reconcileTimeline(
			two,
			[
				{ layer: { id: LAYER }, items: [] },
				{ layer: { id: 'other' }, items: [box('a', 0)] },
			],
			newId,
		);
		expect(result.layers.other!.keyframes[0]!.items[0]!.id).toBe('a');
		const left = result.layers[LAYER]!.keyframes.flatMap(({ items }) => items.map(({ id }) => id));
		expect(left).toHaveLength(1);
		expect(left[0]).toMatch(/^new-/);
	});
});
