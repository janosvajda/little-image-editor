import type { AnnotationChangeKind, AnnotationDocument } from '../annotations/annotationDocument';
import type { AnnotationState } from '../annotations/annotationTypes';
import { itemsInLayerOrder } from '../annotations/contentLayerStructure';
import { LayerNumbering } from '../layers/layerAppearance';
import { AnimationDefaults, type AnimationTimeline, defaultMotionTween, type Tween } from './animationTypes';
import { activeKeyframe, keyframeAt, presentFrame, timelineLength } from './frameEvaluation';
import {
	clearKeyframe,
	copyKeyframe,
	createTimeline,
	EditMode,
	insertFrame,
	keepLayersToEnd,
	insertKeyframe,
	type KeyframeClip,
	type KeyframeContent,
	type LayerContent,
	pasteKeyframe,
	reconcileTimeline,
	removeFrame,
	setTween,
	withFps,
	withPlayhead,
} from './timelineModel';

/**
 * The document's animation, kept in its layers' state so the editor's one
 * undo history covers it. The layers always show the playhead's frame, so
 * every tool, the renderer, selection and export work on that frame as they
 * work on any document. Edits made there are folded back into the timeline
 * before each undo step is recorded. Every timeline edit is one undo step;
 * moving the playhead is not an edit.
 */
export class AnimationDocument {
	#clip: KeyframeClip | null = null;
	/** How a change on a frame that is not a keyframe is kept: by default, as a new tweened pose. */
	editMode: EditMode = EditMode.AutoAnimate;

	constructor(
		private readonly objects: AnnotationDocument,
		private readonly newId: () => string = () => crypto.randomUUID(),
	) {
		objects.setCommitReconciler((state) => {
			if (state.animation) state.animation = reconcileTimeline(state.animation, layerContent(state), newId, this.editMode);
		});
	}

	/** The timeline, or null while the document is not animated. */
	get timeline(): AnimationTimeline | null {
		return this.objects.state.animation ?? null;
	}

	/** How many frames the document has; a document that is not animated has one. */
	get frameCount(): number {
		const { timeline } = this;
		return timeline ? timelineLength(timeline) : 1;
	}

	get playhead(): number {
		return this.timeline?.playhead ?? 0;
	}

	/** The layer timeline edits apply to: the active content layer. */
	get activeLayerId(): string | null {
		return this.objects.activeLayer?.id ?? null;
	}

	/** Whether frames have been copied to paste. */
	get hasCopiedFrames(): boolean {
		return this.#clip !== null;
	}

	/**
	 * Starts a new animation: one empty layer on a one-frame timeline at
	 * `fps`, as the document's starting state rather than an undoable edit.
	 */
	start(fps: number): void {
		const layer = { id: this.newId(), name: new LayerNumbering([]).next(), itemIds: [] };
		this.objects.restore({ objects: [], layers: [layer], nextStep: 1, animation: createTimeline([{ layer, items: [] }], fps) });
		this.objects.activate(layer.id);
	}

	onChange(listener: (change: AnnotationChangeKind) => void): void {
		this.objects.onChange((_state, change) => listener(change));
	}

	/**
	 * Shows another frame; not an undo step. A document not animated yet
	 * starts its timeline, which its next edit records.
	 */
	goToFrame(frame: number): void {
		const timeline = this.currentTimeline();
		const moved = withPlayhead(timeline, frame);
		if (moved !== this.timeline) this.objects.replaceState(presentFrame({ ...this.objects.state, animation: moved }), false);
	}

	/** Whether the active layer has a keyframe at `frame`. */
	isKeyframeAt(frame: number): boolean {
		const layerId = this.activeLayerId;
		const layer = layerId ? this.timeline?.layers[layerId] : undefined;
		return layer ? keyframeAt(layer, frame) !== null : frame === AnimationDefaults.FirstFrame && layerId !== null;
	}

	/** Makes `layerId` the layer timeline edits apply to. */
	activateLayer(layerId: string): void {
		this.objects.activate(layerId);
	}

	insertKeyframe(content: KeyframeContent): boolean {
		return this.editActiveLayer((timeline, layerId) => insertKeyframe(timeline, layerId, timeline.playhead, content));
	}

	insertFrame(): boolean {
		return this.editActiveLayer((timeline, layerId) => insertFrame(timeline, layerId, timeline.playhead));
	}

	removeFrame(): boolean {
		return this.editActiveLayer((timeline, layerId) => removeFrame(timeline, layerId, timeline.playhead));
	}

	clearKeyframe(): boolean {
		return this.editActiveLayer((timeline, layerId) => clearKeyframe(timeline, layerId, timeline.playhead));
	}

	createMotionTween(): boolean {
		return this.setTween(defaultMotionTween());
	}

	removeTween(): boolean {
		return this.setTween(null);
	}

	/** Sets the tween of the active layer's keyframe at the playhead, or removes it with `null`. */
	setTween(tween: Tween | null): boolean {
		return this.editActiveLayer((timeline, layerId) => setTween(timeline, layerId, timeline.playhead, tween));
	}

	/** The tween of the active layer's keyframe at the playhead. */
	activeTween(): Tween | null {
		const { timeline, activeLayerId } = this;
		const layer = timeline && activeLayerId ? timeline.layers[activeLayerId] : undefined;
		return layer ? (activeKeyframe(layer, timeline!.playhead)?.tween ?? null) : null;
	}

	/** Copies the active layer's keyframe at the playhead, ready to paste. */
	copyFrames(): boolean {
		const timeline = this.currentTimeline();
		const layerId = this.activeLayerId;
		this.#clip = layerId ? (copyKeyframe(timeline, layerId, timeline.playhead) ?? this.#clip) : this.#clip;
		return this.#clip !== null;
	}

	pasteFrames(): boolean {
		const clip = this.#clip;
		return clip !== null && this.editActiveLayer((timeline, layerId) => pasteKeyframe(timeline, layerId, timeline.playhead, clip, this.newId));
	}

	setFps(fps: number): boolean {
		return this.edit((timeline) => withFps(timeline, fps));
	}

	/** Puts a layer in another layer's place in the stack. */
	moveLayer(layerId: string, targetLayerId: string): void {
		this.objects.moveLayerTo(layerId, targetLayerId);
	}

	private editActiveLayer(change: (timeline: AnimationTimeline, layerId: string) => AnimationTimeline): boolean {
		const layerId = this.activeLayerId;
		return layerId !== null && this.edit((timeline) => change(timeline, layerId));
	}

	/** Applies a timeline edit as one undo step, starting the timeline when the document is not animated yet. */
	private edit(change: (timeline: AnimationTimeline) => AnimationTimeline): boolean {
		const current = this.currentTimeline();
		const changed = keepLayersToEnd(current, change(current));
		if (changed === current) return false;
		this.objects.replaceState(presentFrame({ ...this.objects.state, animation: changed }), true);
		return true;
	}

	/** The timeline, or a new one-frame timeline of the document as it is. */
	private currentTimeline(): AnimationTimeline {
		return this.timeline ?? createTimeline(layerContent(this.objects.state));
	}
}

/** Each layer with the items it shows. */
function layerContent(state: Readonly<AnnotationState>): LayerContent[] {
	const itemsById = new Map(state.objects.map((item) => [item.id, item]));
	return state.layers.map((layer) => ({ layer, items: itemsInLayerOrder([layer], itemsById) }));
}
