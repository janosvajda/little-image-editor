import type { KeyValueStorage } from '../../platform/editorPlatform';
import { DocumentType } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationChangeKind, type AnnotationDocument } from '../annotations/annotationDocument';
import type { AnimationDocument } from './animationDocument';
import { AnimationPlayer, BROWSER_FRAME_SCHEDULER, type FrameScheduler } from './animationPlayer';
import { AnimationDefaults, CSS_EASE_POINTS, Ease, type Tween } from './animationTypes';
import type { OnionSkinCanvas } from './onionSkin';
import { PlaybackMode } from './playbackClock';
import { TimelineContextMenu, type TimelineMenuGroups } from './timelineContextMenu';
import { EditMode, KeyframeContent } from './timelineModel';
import { GUIDE_TEXT, guideStep } from './timelineGuide';
import { easeFromControls, rotateDirectionFromControl, TIMELINE_COMMAND_LABELS, TimelinePanel, type TimelinePanelActions } from './timelinePanel';
import { TimelineCommand, timelineCommandFor, timelineShortcutLabel } from './timelineShortcuts';
import { TimelineDisplay, timelineLayerViews, visibleFrameCount } from './timelineView';

/** Whether the timeline is shown, and whether it is folded down to its header, for laying out around it. */
export interface TimelineLayout {
	readonly visible: boolean;
	readonly collapsed: boolean;
}

/** The open document as the timeline needs it: whether it is an animation. */
export type TimelineDocumentSource = Pick<CanvasDocument, 'hasImage' | 'documentType' | 'onDocumentChange'>;

/** Where the timeline keeps the viewer's own preferences. */
export const TimelinePreference = {
	/** Stored as the edit mode's own name. */
	EditMode: 'littleImageEditor.timeline.editMode',
	Collapsed: 'littleImageEditor.timeline.collapsed',
	Loop: 'littleImageEditor.timeline.loop',
	OnionSkin: 'littleImageEditor.timeline.onionSkin',
	FrameWidth: 'littleImageEditor.timeline.frameWidth',
} as const;
type TimelinePreference = (typeof TimelinePreference)[keyof typeof TimelinePreference];
const STORED_TRUE = 'true';
const EASE_POINT_SEPARATOR = /[\s,]+/;

/** Edits that stop playback: the document changing under it. */
const EDIT_CHANGES: ReadonlySet<AnnotationChangeKind> = new Set([AnnotationChangeKind.Committed, AnnotationChangeKind.Transient, AnnotationChangeKind.Interaction]);
/** Changes that leave the timeline as it was. */
const PASSING_CHANGES: ReadonlySet<AnnotationChangeKind> = new Set([AnnotationChangeKind.Transient, AnnotationChangeKind.Interaction]);

/**
 * The timeline panel at work: it shows the frames of an animation document,
 * turns its buttons, menu and keys into timeline edits and playback, and
 * keeps the viewer's timeline preferences. It is shown exactly while an
 * animation is open; images never have one. Its keys work only then, so F5
 * and the other keys keep their usual meaning otherwise.
 */
export class TimelineController {
	readonly panel: TimelinePanel;
	readonly menu: TimelineContextMenu;
	readonly #player: AnimationPlayer;
	readonly #layoutListeners = new Set<(layout: TimelineLayout) => void>();
	#visible = false;
	#loop: boolean;
	#onionSkin: boolean;
	#frameWidth: number;

	constructor(
		private readonly animation: AnimationDocument,
		private readonly objects: AnnotationDocument,
		document: TimelineDocumentSource,
		private readonly storage: KeyValueStorage,
		private readonly onionSkin: OnionSkinCanvas | null = null,
		scheduler: FrameScheduler = BROWSER_FRAME_SCHEDULER,
	) {
		this.panel = new TimelinePanel(this.panelActions());
		this.menu = new TimelineContextMenu((command) => this.run(command));
		this.#player = new AnimationPlayer((frame) => animation.goToFrame(frame), scheduler);
		this.#loop = storage.getItem(TimelinePreference.Loop) !== String(false);
		this.#onionSkin = this.storedFlag(TimelinePreference.OnionSkin);
		animation.editMode = storedEditMode(storage.getItem(TimelinePreference.EditMode));
		this.#frameWidth = clampFrameWidth(Number(storage.getItem(TimelinePreference.FrameWidth)) || TimelineDisplay.DefaultFrameWidth);
		this.panel.setCollapsed(this.storedFlag(TimelinePreference.Collapsed));
		this.panel.element.hidden = true;
		this.bindControls();
		this.#player.onPlayingChange(() => this.render());
		animation.onChange((change) => this.onDocumentChange(change));
		document.onDocumentChange(() => this.setVisible(document.hasImage && document.documentType === DocumentType.Animation));
	}

	get visible(): boolean {
		return this.#visible;
	}

	get playing(): boolean {
		return this.#player.playing;
	}

	get layout(): TimelineLayout {
		return { visible: this.#visible, collapsed: this.panel.collapsed };
	}

	/** Told now and whenever the timeline is shown, hidden, folded or unfolded. */
	onLayoutChange(listener: (layout: TimelineLayout) => void): void {
		this.#layoutListeners.add(listener);
		listener(this.layout);
	}

	private setVisible(visible: boolean): void {
		if (visible === this.#visible) return;
		this.#visible = visible;
		this.panel.element.hidden = !visible;
		if (!visible) {
			this.#player.stop();
			this.menu.close();
		}
		this.render();
		this.emitLayout();
	}

	/** Runs the timeline command a key asks for, while the timeline is shown; whether it was one. */
	handleShortcut(key: string, shift: boolean): boolean {
		const command = this.#visible ? timelineCommandFor(key, shift) : null;
		if (!command) return false;
		this.run(command);
		return true;
	}

	run(command: TimelineCommand): void {
		if (command !== TimelineCommand.TogglePlayback) this.#player.stop();
		const { animation } = this;
		switch (command) {
			case TimelineCommand.InsertKeyframe:
				animation.insertKeyframe(KeyframeContent.Copy);
				return;
			case TimelineCommand.InsertBlankKeyframe:
				animation.insertKeyframe(KeyframeContent.Blank);
				return;
			case TimelineCommand.InsertFrame:
				animation.insertFrame();
				return;
			case TimelineCommand.RemoveFrame:
				animation.removeFrame();
				return;
			case TimelineCommand.ClearKeyframe:
				animation.clearKeyframe();
				return;
			case TimelineCommand.PreviousFrame:
				animation.goToFrame(animation.playhead - 1);
				return;
			case TimelineCommand.NextFrame:
				animation.goToFrame(animation.playhead + 1);
				return;
			case TimelineCommand.TogglePlayback:
				this.togglePlayback();
				return;
			case TimelineCommand.CreateMotionTween:
				animation.createMotionTween();
				return;
			case TimelineCommand.RemoveTween:
				animation.removeTween();
				return;
			case TimelineCommand.CopyFrames:
				animation.copyFrames();
				return;
			case TimelineCommand.PasteFrames:
				animation.pasteFrames();
				return;
		}
	}

	togglePlayback(): void {
		const { animation } = this;
		this.#player.toggle({ fps: animation.timeline?.fps ?? AnimationDefaults.Fps, frameCount: animation.frameCount, startFrame: animation.playhead, mode: this.#loop ? PlaybackMode.Loop : PlaybackMode.Once });
	}

	/** The frame actions the menu offers at the playhead, those that would change nothing turned off. */
	menuGroups(): TimelineMenuGroups {
		const available = this.availableCommands();
		const entry = (command: TimelineCommand) => ({ command, label: TIMELINE_COMMAND_LABELS[command], shortcut: timelineShortcutLabel(command), enabled: available[command] });
		return [
			[entry(TimelineCommand.CreateMotionTween), entry(TimelineCommand.RemoveTween)],
			[entry(TimelineCommand.InsertKeyframe), entry(TimelineCommand.InsertBlankKeyframe), entry(TimelineCommand.ClearKeyframe)],
			[entry(TimelineCommand.InsertFrame), entry(TimelineCommand.RemoveFrame)],
			[entry(TimelineCommand.CopyFrames), entry(TimelineCommand.PasteFrames)],
		];
	}

	/** Which commands would change anything now: the menu and the buttons turn the others off. Frame edits need a layer. */
	availableCommands(): Readonly<Record<TimelineCommand, boolean>> {
		const { animation } = this;
		const layer = animation.activeLayerId !== null;
		const tween = animation.activeTween() !== null;
		const keyframe = animation.isKeyframeAt(animation.playhead);
		return {
			[TimelineCommand.CreateMotionTween]: layer && !tween,
			[TimelineCommand.RemoveTween]: layer && tween,
			[TimelineCommand.InsertKeyframe]: layer && !keyframe,
			[TimelineCommand.InsertBlankKeyframe]: layer && !keyframe,
			[TimelineCommand.ClearKeyframe]: layer && keyframe && animation.playhead > AnimationDefaults.FirstFrame,
			[TimelineCommand.InsertFrame]: layer,
			[TimelineCommand.RemoveFrame]: layer && animation.playhead < animation.frameCount,
			[TimelineCommand.CopyFrames]: layer,
			[TimelineCommand.PasteFrames]: layer && animation.hasCopiedFrames,
			[TimelineCommand.PreviousFrame]: animation.playhead > AnimationDefaults.FirstFrame,
			[TimelineCommand.NextFrame]: true,
			[TimelineCommand.TogglePlayback]: true,
		};
	}

	/** The next step to make an animation, from what the active layer holds. */
	private guide(): string {
		const { animation, objects } = this;
		const layerId = animation.activeLayerId;
		const keyframes = (layerId && animation.timeline?.layers[layerId]?.keyframes) || (objects.activeLayer ? [{ frame: AnimationDefaults.FirstFrame, tween: null }] : []);
		const hasDrawing = objects.state.objects.length > 0 || Object.values(animation.timeline?.layers ?? {}).some((layer) => layer.keyframes.some(({ items }) => items.length > 0));
		const step = guideStep({ playing: this.#player.playing, hasDrawing, keyframes, playhead: animation.playhead, editMode: animation.editMode });
		return GUIDE_TEXT[step][animation.editMode];
	}

	private panelActions(): TimelinePanelActions {
		return {
			pickFrame: (layerId, frame) => {
				this.#player.stop();
				if (layerId !== null) this.animation.activateLayer(layerId);
				this.animation.goToFrame(frame);
				this.render();
			},
			openMenu: (layerId, frame, clientX, clientY) => {
				this.#player.stop();
				this.animation.activateLayer(layerId);
				this.animation.goToFrame(frame);
				this.menu.show(this.menuGroups(), clientX, clientY);
			},
			toggleLayerVisible: (layerId) => this.objects.setLayerVisible(layerId, this.objects.layer(layerId)?.visible === false),
			toggleLayerLocked: (layerId) => this.objects.setLayerLocked(layerId, this.objects.layer(layerId)?.locked !== true),
			moveLayer: (layerId, targetLayerId) => this.animation.moveLayer(layerId, targetLayerId),
		};
	}

	private bindControls(): void {
		const { panel } = this;
		panel.playButton.addEventListener('click', () => this.togglePlayback());
		panel.newLayerButton.addEventListener('click', () => this.objects.createLayer());
		for (const [command, button] of panel.actionButtons) button.addEventListener('click', () => this.run(command));
		panel.tweenButton.addEventListener('click', () => this.run(this.animation.activeTween() ? TimelineCommand.RemoveTween : TimelineCommand.CreateMotionTween));
		panel.autoAnimateButton.addEventListener('click', () => {
			const editMode = this.animation.editMode === EditMode.AutoAnimate ? EditMode.Hold : EditMode.AutoAnimate;
			this.animation.editMode = editMode;
			this.storage.setItem(TimelinePreference.EditMode, editMode);
			this.render();
		});
		panel.loopButton.addEventListener('click', () => {
			this.#loop = !this.#loop;
			this.store(TimelinePreference.Loop, this.#loop);
			this.render();
		});
		panel.onionButton.addEventListener('click', () => {
			this.#onionSkin = !this.#onionSkin;
			this.store(TimelinePreference.OnionSkin, this.#onionSkin);
			this.render();
		});
		panel.onCollapseToggle(() => {
			panel.setCollapsed(!panel.collapsed);
			this.store(TimelinePreference.Collapsed, panel.collapsed);
			this.emitLayout();
		});
		panel.frameInput.addEventListener('change', () => {
			this.#player.stop();
			this.animation.goToFrame(Number(panel.frameInput.value) - TimelineDisplay.FrameNumberOffset);
			this.render();
		});
		panel.fpsInput.addEventListener('change', () => {
			if (!this.animation.setFps(Number(panel.fpsInput.value))) this.render();
		});
		panel.zoomInput.addEventListener('input', () => {
			this.#frameWidth = clampFrameWidth(Number(panel.zoomInput.value));
			this.storage.setItem(TimelinePreference.FrameWidth, String(this.#frameWidth));
			this.render();
		});
		for (const control of [panel.easeSelect, panel.easePointsInput, panel.rotateSelect, panel.extraTurnsInput])
			control.addEventListener('change', () => this.changeTween());
	}

	/** Applies the tween controls to the tween at the playhead, as one undo step. */
	private changeTween(): void {
		const current = this.animation.activeTween();
		if (!current) return;
		const { panel } = this;
		const points = panel.easePointsInput.value.split(EASE_POINT_SEPARATOR).filter(Boolean).map(Number);
		const ease = easeFromControls(panel.easeSelect.value, points.length ? points : [...defaultCustomEase(current)]);
		const rotate = rotateDirectionFromControl(panel.rotateSelect.value);
		const turns = Math.floor(panel.extraTurnsInput.valueAsNumber);
		const extraTurns = Number.isFinite(turns) ? { extraTurns: Math.max(AnimationDefaults.MinimumExtraTurns, turns) } : {};
		const tween: Tween = { ...current, ...(ease ? { ease } : {}), ...(rotate ? { rotate } : {}), ...extraTurns };
		if (!this.animation.setTween(tween)) this.render();
	}

	private onDocumentChange(change: AnnotationChangeKind): void {
		if (EDIT_CHANGES.has(change)) this.#player.stop();
		if (PASSING_CHANGES.has(change)) return;
		this.render();
	}

	private render(): void {
		const { animation } = this;
		if (this.#visible) {
			const timeline = animation.timeline;
			const frames = Math.max(visibleFrameCount(animation.frameCount), animation.playhead + TimelineDisplay.TrailingFrames);
			this.panel.render({
				layers: timelineLayerViews(this.objects.state.layers, timeline?.layers ?? {}, animation.activeLayerId, frames),
				visibleFrames: frames,
				frameCount: animation.frameCount,
				playhead: animation.playhead,
				fps: timeline?.fps ?? AnimationDefaults.Fps,
				playing: this.#player.playing,
				loop: this.#loop,
				onionSkin: this.#onionSkin,
				frameWidth: this.#frameWidth,
				tween: animation.activeTween(),
				available: this.availableCommands(),
				autoAnimate: animation.editMode === EditMode.AutoAnimate,
				guide: this.guide(),
			});
		}
		this.onionSkin?.render(this.#visible && this.#onionSkin && !this.#player.playing ? this.objects.state : null);
	}

	private emitLayout(): void {
		const { layout } = this;
		this.#layoutListeners.forEach((listener) => listener(layout));
	}

	private storedFlag(key: TimelinePreference): boolean {
		return this.storage.getItem(key) === STORED_TRUE;
	}

	private store(key: TimelinePreference, value: boolean): void {
		this.storage.setItem(key, String(value));
	}
}

/** The control points a custom ease starts from: its own, or CSS's `ease`. */
function defaultCustomEase(tween: Tween): readonly number[] {
	return tween.ease.kind === Ease.Custom ? tween.ease.points : CSS_EASE_POINTS;
}

/** A stored edit mode; changing a later frame animates by itself unless the viewer chose otherwise. */
function storedEditMode(value: string | null): EditMode {
	return Object.values(EditMode).find((mode) => mode === value) ?? EditMode.AutoAnimate;
}

function clampFrameWidth(width: number): number {
	return Math.min(TimelineDisplay.MaximumFrameWidth, Math.max(TimelineDisplay.MinimumFrameWidth, Math.round(width)));
}
