import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { AnnotationChangeKind, AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { AnimationDocument } from './animationDocument';
import { defaultMotionTween, Ease, RotateDirection, TweenKind } from './animationTypes';
import { EditMode, KeyframeContent } from './timelineModel';

function box(id: string, x: number): ShapeAnnotation {
	return { id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x, y: 0, width: 10, height: 10 }, color: '#000000', width: 1, opacity: 1, fill: false };
}

let counter = 0;

function animatedDocument(): { objects: AnnotationDocument; animation: AnimationDocument; layerId: string } {
	const objects = new AnnotationDocument();
	const animation = new AnimationDocument(objects, () => `id-${++counter}`);
	objects.add(box('a', 0));
	return { objects, animation, layerId: objects.activeLayer!.id };
}

function keyframeFrames(animation: AnimationDocument, layerId: string): number[] {
	return animation.timeline!.layers[layerId]!.keyframes.map(({ frame }) => frame);
}

describe('animation document', () => {
	it('starts unanimated with one frame, and the first edit starts the timeline', () => {
		const { animation, layerId } = animatedDocument();
		expect(animation.timeline).toBeNull();
		expect(animation.frameCount).toBe(1);
		expect(animation.playhead).toBe(0);
		expect(animation.activeTween()).toBeNull();
		expect(animation.isKeyframeAt(0)).toBe(true);
		expect(animation.isKeyframeAt(1)).toBe(false);
		expect(animation.insertFrame()).toBe(true);
		expect(animation.timeline!.layers[layerId]!.length).toBe(2);
		expect(animation.isKeyframeAt(0)).toBe(true);
	});

	it('makes every timeline edit one undo step, and undo takes each back', () => {
		const { objects, animation, layerId } = animatedDocument();
		const steps: Array<() => boolean> = [
			() => animation.setFps(12),
			() => {
				animation.goToFrame(0);
				return animation.insertFrame();
			},
			() => {
				objects.replaceState({ ...objects.state, animation: { ...animation.timeline!, playhead: 5 } }, false);
				return animation.insertKeyframe(KeyframeContent.Copy);
			},
			() => animation.createMotionTween(),
			() => animation.setTween({ kind: TweenKind.Motion, ease: { kind: Ease.EaseOut }, rotate: RotateDirection.Clockwise, extraTurns: 1 }),
			() => animation.removeTween(),
			() => animation.insertKeyframe(KeyframeContent.Blank) || animation.clearKeyframe(),
			() => animation.removeFrame(),
			() => {
				animation.goToFrame(0);
				animation.copyFrames();
				animation.goToFrame(3);
				return animation.pasteFrames();
			},
		];
		const snapshots = [structuredClone(objects.state)];
		for (const step of steps) {
			const depth = objects.undoDepth;
			expect(step()).toBe(true);
			expect(objects.undoDepth).toBe(depth + 1);
			snapshots.push(structuredClone(objects.state));
		}
		for (let index = snapshots.length - 2; index >= 0; index--) {
			objects.undo();
			expect(objects.state.animation).toEqual(snapshots[index]!.animation);
		}
		expect(objects.state.animation).toBeUndefined();
		expect(layerId).toBeTruthy();
	});

	it('records no step for an edit that changes nothing', () => {
		const { objects, animation } = animatedDocument();
		const depth = objects.undoDepth;
		expect(animation.clearKeyframe()).toBe(false);
		expect(animation.pasteFrames()).toBe(false);
		expect(objects.undoDepth).toBe(depth);
	});

	it('moves the playhead without an undo step, showing that frame', () => {
		const { objects, animation, layerId } = animatedDocument();
		const changes: string[] = [];
		animation.onChange((change) => changes.push(change));
		animation.insertFrame();
		objects.replaceState({ ...objects.state, animation: { ...animation.timeline!, playhead: 6 } }, false);
		animation.insertKeyframe(KeyframeContent.Blank);
		const depth = objects.undoDepth;
		animation.goToFrame(2);
		expect(objects.undoDepth).toBe(depth);
		expect(objects.layerItems(layerId).map(({ id }) => id)).toEqual(['a']);
		animation.goToFrame(6);
		expect(objects.layerItems(layerId)).toEqual([]);
		expect(changes).toContain(AnnotationChangeKind.Presentation);
		animation.goToFrame(6);
		expect(animation.playhead).toBe(6);
	});

	it('folds an edit made with the tools into the keyframe at the playhead', () => {
		const { objects, animation, layerId } = animatedDocument();
		animation.insertFrame();
		objects.replaceState({ ...objects.state, animation: { ...animation.timeline!, playhead: 4 } }, false);
		animation.insertKeyframe(KeyframeContent.Copy);
		animation.goToFrame(0);
		animation.createMotionTween();
		animation.goToFrame(2);
		objects.move('a', { x: 30, y: 0 });
		expect(keyframeFrames(animation, layerId)).toEqual([0, 2, 4]);
		animation.goToFrame(4);
		objects.move('a', { x: 5, y: 0 });
		const last = animation.timeline!.layers[layerId]!.keyframes[2]!;
		expect((last.items[0] as ShapeAnnotation).rect.x).toBe(5);
	});

	it('keeps the selection when the shown frame still has the item', () => {
		const { objects, animation } = animatedDocument();
		animation.insertFrame();
		objects.replaceState({ ...objects.state, animation: { ...animation.timeline!, playhead: 3 } }, false);
		animation.insertKeyframe(KeyframeContent.Copy);
		objects.select('a');
		animation.goToFrame(0);
		expect(objects.selectedId).toBe('a');
		objects.replaceState({ ...objects.state, animation: { ...animation.timeline!, playhead: 3 } }, false);
		animation.insertKeyframe(KeyframeContent.Blank);
		objects.selectLayer(objects.activeLayer!.id);
		animation.clearKeyframe();
		expect(objects.selectedLayer).not.toBeNull();
	});

	it('gives new layers a timeline, follows layer moves and forgets removed layers', () => {
		const { objects, animation, layerId } = animatedDocument();
		animation.insertFrame();
		const second = objects.createLayer();
		expect(Object.keys(animation.timeline!.layers)).toEqual([layerId, second]);
		animation.moveLayer(second, layerId);
		expect(objects.state.layers.map(({ id }) => id)).toEqual([second, layerId]);
		objects.removeLayer(second);
		expect(Object.keys(animation.timeline!.layers)).toEqual([layerId]);
	});

	it('edits nothing while the image layer is active', () => {
		const { objects, animation } = animatedDocument();
		objects.activate(null);
		expect(animation.activeLayerId).toBeNull();
		expect(animation.insertFrame()).toBe(false);
		expect(animation.copyFrames()).toBe(false);
		animation.activateLayer(objects.state.layers[0]!.id);
		expect(animation.activeLayerId).toBe(objects.state.layers[0]!.id);
	});

	it('reports the active tween and whether frames were copied', () => {
		const { animation } = animatedDocument();
		expect(animation.hasCopiedFrames).toBe(false);
		animation.createMotionTween();
		expect(animation.activeTween()).toEqual(defaultMotionTween());
		expect(animation.copyFrames()).toBe(true);
		expect(animation.hasCopiedFrames).toBe(true);
	});
});

describe('moving to a frame of a document not animated yet', () => {
	it('starts its timeline without an undo step, the next edit recording it', () => {
		const { objects, animation, layerId } = animatedDocument();
		const depth = objects.undoDepth;
		animation.goToFrame(4);
		expect(animation.playhead).toBe(4);
		expect(objects.undoDepth).toBe(depth);
		// Past the end the last frame is shown, ready to continue from.
		expect(objects.layerItems(layerId).map(({ id }) => id)).toEqual(['a']);
		expect(animation.insertKeyframe(KeyframeContent.Copy)).toBe(true);
		expect(animation.timeline!.layers[layerId]!.keyframes.map(({ frame }) => frame)).toEqual([0, 4]);
		expect(objects.layerItems(layerId).map(({ id }) => id)).toEqual(['a']);
	});
});

describe('a document crop', () => {
	it('moves every keyframe with the frame shown', () => {
		const { objects, animation, layerId } = animatedDocument();
		animation.goToFrame(3);
		animation.insertKeyframe(KeyframeContent.Copy);
		objects.translateAll({ x: -5, y: -2 }, false);
		const xs = animation.timeline!.layers[layerId]!.keyframes.map(({ items }) => (items[0] as ShapeAnnotation).rect.x);
		expect(xs).toEqual([-5, -5]);
		objects.move('a', { x: 1, y: 0 });
		expect(animation.timeline!.layers[layerId]!.keyframes.map(({ items }) => (items[0] as ShapeAnnotation).rect.x)).toEqual([-5, -4]);
	});
});

describe('animating by changing a later frame', () => {
	it('makes the change a new pose, tweened from the pose before, in one undo step', () => {
		const { objects, animation, layerId } = animatedDocument();
		animation.goToFrame(10);
		const depth = objects.undoDepth;
		objects.move('a', { x: 50, y: 0 });
		expect(objects.undoDepth).toBe(depth + 1);
		const layer = animation.timeline!.layers[layerId]!;
		expect(layer.keyframes.map(({ frame }) => frame)).toEqual([0, 10]);
		expect(layer.keyframes[0]!.tween).toEqual(defaultMotionTween());
		expect(layer.length).toBe(11);
		animation.goToFrame(5);
		expect((objects.layerItems(layerId)[0] as ShapeAnnotation).rect.x).toBe(25);
		animation.goToFrame(20);
		objects.move('a', { x: 50, y: 0 });
		expect(animation.timeline!.layers[layerId]!.keyframes.map(({ frame, tween }) => [frame, tween !== null])).toEqual([
			[0, true],
			[10, true],
			[20, false],
		]);
		objects.undo();
		expect(animation.timeline!.layers[layerId]!.keyframes.map(({ frame }) => frame)).toEqual([0, 10]);
	});

	it('changes the held keyframe instead when asked to', () => {
		const { objects, animation, layerId } = animatedDocument();
		animation.editMode = EditMode.Hold;
		animation.insertFrame();
		animation.insertFrame();
		animation.goToFrame(2);
		objects.move('a', { x: 5, y: 0 });
		expect(animation.timeline!.layers[layerId]!.keyframes.map(({ frame }) => frame)).toEqual([0]);
		expect((animation.timeline!.layers[layerId]!.keyframes[0]!.items[0] as ShapeAnnotation).rect.x).toBe(5);
	});

	it('keeps layers that lasted to the end lasting, as the animation grows', () => {
		const { objects, animation, layerId } = animatedDocument();
		const background = objects.createLayer();
		objects.add(box('sky', 0));
		objects.activate(layerId);
		animation.goToFrame(8);
		objects.move('a', { x: 10, y: 0 });
		expect(animation.timeline!.layers[background]!.length).toBe(9);
		animation.goToFrame(12);
		animation.activateLayer(layerId);
		expect(animation.insertKeyframe(KeyframeContent.Copy)).toBe(true);
		expect(animation.timeline!.layers[background]!.length).toBe(13);
	});
});
