import { createEditorIcon, EditorIconId } from '../../shared/style/editorIcons';
import { LayerListDrag, type LayerListEntry, LayerListEntryKind, markRowEntry } from '../layers/layerListDrag';
import { LayerRowClass, layerActionButton, layerIconButton, layerLockButton, layerVisibilityButton } from '../layers/layerRowControls';
import { AnimationDefaults, Ease, type EaseSpec, RotateDirection, type Tween } from './animationTypes';
import { timelineShortcutLabel, TimelineCommand } from './timelineShortcuts';
import { EASE_LABELS, FrameTweenState, ROTATE_DIRECTION_LABELS, TimelineDisplay, type TimelineLayerView } from './timelineView';

/** What the timeline shows: its layers' frames, the playhead, playback and the tween at the playhead. */
export interface TimelinePanelView {
	readonly layers: readonly TimelineLayerView[];
	readonly visibleFrames: number;
	readonly frameCount: number;
	readonly playhead: number;
	readonly fps: number;
	readonly playing: boolean;
	readonly loop: boolean;
	readonly onionSkin: boolean;
	readonly frameWidth: number;
	/** The tween of the active layer's keyframe at the playhead. */
	readonly tween: Tween | null;
	/** Which frame actions would change anything now. */
	readonly available: Readonly<Record<TimelineCommand, boolean>>;
	/** Whether changing a later frame makes a new pose by itself. */
	readonly autoAnimate: boolean;
	/** The next step, in plain words. */
	readonly guide: string;
}

/** The frame actions the timeline shows as buttons, in their order. */
export const TIMELINE_ACTION_COMMANDS = [TimelineCommand.InsertKeyframe, TimelineCommand.InsertBlankKeyframe, TimelineCommand.InsertFrame, TimelineCommand.RemoveFrame] as const;

/** What the timeline's rows ask of their owner. */
export interface TimelinePanelActions {
	/** A frame was pressed or dragged over; `layerId` is null on the ruler. */
	pickFrame(layerId: string | null, frame: number): void;
	openMenu(layerId: string, frame: number, clientX: number, clientY: number): void;
	toggleLayerVisible(layerId: string): void;
	toggleLayerLocked(layerId: string): void;
	moveLayer(layerId: string, targetLayerId: string): void;
}

const TimelineClass = {
	Dock: 'timeline-dock',
	Header: 'panel-header timeline-header',
	Title: 'timeline-title',
	Controls: 'timeline-controls',
	Group: 'timeline-group',
	TweenGroup: 'timeline-group timeline-tween',
	Toggle: 'timeline-toggle',
	Body: 'timeline-body',
	Scroll: 'timeline-scroll',
	Grid: 'timeline-grid',
	RulerRow: 'timeline-ruler-row',
	Corner: 'timeline-corner',
	Ruler: 'timeline-ruler',
	RulerMark: 'timeline-ruler-mark',
	Rows: 'timeline-rows',
	Row: 'timeline-row',
	Layer: 'timeline-layer',
	DragHandle: 'layer-drag-handle',
	Frames: 'timeline-frames',
	Cell: 'timeline-cell',
	Playhead: 'timeline-playhead',
	Collapse: 'collapse',
	Actions: 'timeline-actions',
	Action: 'timeline-action',
	Guide: 'timeline-guide',
	Empty: 'timeline-empty',
	Active: 'active',
	Locked: 'locked',
	Current: 'current',
	Collapsed: 'collapsed',
	/** The grid shows a hint in place of rows, and no playhead. */
	EmptyGrid: 'empty',
} as const;

/** CSS custom properties the timeline lays itself out by. */
const TimelineProperty = { FrameWidth: '--timeline-frame-width', Frames: '--timeline-frames', Playhead: '--timeline-playhead' } as const;
const PIXEL_UNIT = 'px';
/** The collapse button's sign, as the other panels show it. */
const CollapseGlyph = { Expanded: '−', Collapsed: '+' } as const;

const TimelineText = {
	Title: 'Timeline',
	Play: 'Play',
	Pause: 'Pause',
	Loop: 'Loop playback',
	OnionSkin: 'Onion skin: show the frames before and after, faded',
	Frame: 'Frame',
	Fps: 'FPS',
	Zoom: 'Frame width',
	Tween: 'Tween',
	Ease: 'Ease',
	EasePoints: 'Custom ease control points: x1, y1, x2, y2',
	Rotate: 'Rotate',
	ExtraTurns: 'Extra turns',
	Collapse: 'Collapse the timeline',
	Layers: 'Layers',
	Frames: 'Frames',
	OfFrames: '/ ',
	DragLayer: 'Drag to reorder',
	NewLayer: 'New layer',
	TweenOn: 'Remove the tween: hold this pose until the next one',
	TweenOff: 'Tween: make the frames up to the next pose move smoothly',
	AutoAnimate: 'Auto-animate',
	AutoAnimateHint: 'Auto-animate: changing your drawing on a later frame makes a new pose there, and the frames in between are made for you',
	Empty: 'No layers yet. Add a layer, or draw on the canvas, to start animating.',
} as const;

/**
 * The timeline docked under the canvas: a header of playback and frame
 * controls, and below it a row for each layer, top layer first, with the
 * layer's visibility and lock and its frames. It only presents; its owner
 * decides what each control does.
 */
export class TimelinePanel {
	readonly element = document.createElement('section');
	readonly playButton: HTMLButtonElement;
	readonly loopButton: HTMLButtonElement;
	readonly onionButton: HTMLButtonElement;
	readonly newLayerButton: HTMLButtonElement;
	/** The frame action buttons, by command. */
	readonly actionButtons: ReadonlyMap<TimelineCommand, HTMLButtonElement>;
	readonly tweenButton: HTMLButtonElement;
	readonly autoAnimateButton: HTMLButtonElement;
	readonly #guide = document.createElement('p');
	readonly frameInput = document.createElement('input');
	readonly fpsInput = document.createElement('input');
	readonly zoomInput = document.createElement('input');
	readonly easeSelect = document.createElement('select');
	readonly easePointsInput = document.createElement('input');
	readonly rotateSelect = document.createElement('select');
	readonly extraTurnsInput = document.createElement('input');
	readonly #frameTotal = document.createElement('output');
	readonly #controls = document.createElement('div');
	readonly #tweenGroup = document.createElement('div');
	readonly #grid = document.createElement('div');
	readonly #ruler = document.createElement('div');
	readonly #rows = document.createElement('div');
	readonly #collapseButton = document.createElement('button');
	readonly #drag: LayerListDrag;
	#structure = '';
	#scrubbing: { readonly layerId: string | null; readonly pointerId: number } | null = null;

	constructor(private readonly actions: TimelinePanelActions) {
		this.element.className = TimelineClass.Dock;
		this.element.dataset.ui = '';
		this.element.setAttribute('aria-label', TimelineText.Title);
		this.playButton = layerIconButton(EditorIconId.Play, playLabel(false), () => undefined);
		this.loopButton = toggleButton(EditorIconId.Loop, TimelineText.Loop);
		this.onionButton = toggleButton(EditorIconId.OnionSkin, TimelineText.OnionSkin);
		this.newLayerButton = layerIconButton(EditorIconId.NewLayer, TimelineText.NewLayer, () => undefined);
		this.actionButtons = new Map(TIMELINE_ACTION_COMMANDS.map((command) => [command, actionButton(TIMELINE_COMMAND_LABELS[command], command)]));
		this.tweenButton = actionButton(TimelineText.Tween, TimelineCommand.CreateMotionTween);
		this.autoAnimateButton = actionButton(TimelineText.AutoAnimate, null);
		this.autoAnimateButton.title = TimelineText.AutoAnimateHint;
		this.#drag = new LayerListDrag(this.#rows, this.#rows, (dragged, target) => this.drop(dragged, target));
		this.element.append(this.createHeader(), this.createActions(), this.createBody());
	}

	/** Whether the body is folded away, leaving the header. */
	get collapsed(): boolean {
		return this.element.classList.contains(TimelineClass.Collapsed);
	}

	setCollapsed(collapsed: boolean): void {
		this.element.classList.toggle(TimelineClass.Collapsed, collapsed);
		this.#collapseButton.textContent = collapsed ? CollapseGlyph.Collapsed : CollapseGlyph.Expanded;
		this.#collapseButton.setAttribute('aria-expanded', String(!collapsed));
	}

	onCollapseToggle(listener: () => void): void {
		this.#collapseButton.addEventListener('click', listener);
	}

	render(view: TimelinePanelView): void {
		const structure = JSON.stringify([view.layers, view.visibleFrames]);
		if (structure !== this.#structure) {
			this.#structure = structure;
			this.renderRuler(view.visibleFrames);
			const rows = this.rowsOf(view);
			this.#rows.replaceChildren(...rows);
			this.#grid.classList.toggle(TimelineClass.EmptyGrid, view.layers.length === 0);
		}
		this.#grid.style.setProperty(TimelineProperty.FrameWidth, `${view.frameWidth}${PIXEL_UNIT}`);
		this.#grid.style.setProperty(TimelineProperty.Frames, String(view.visibleFrames));
		this.#grid.style.setProperty(TimelineProperty.Playhead, String(view.playhead));
		for (const cell of this.#grid.querySelectorAll(`.${TimelineClass.Current}`)) cell.classList.remove(TimelineClass.Current);
		for (const cell of this.#grid.querySelectorAll(`[data-frame="${view.playhead}"]`)) cell.classList.add(TimelineClass.Current);
		this.renderControls(view);
		this.renderActions(view);
	}

	/** A row per layer, or, without layers, how to add one. */
	private rowsOf(view: TimelinePanelView): HTMLElement[] {
		return view.layers.length ? view.layers.map((layer) => this.row(layer)) : [hint(TimelineText.Empty)];
	}

	/** The frame under a point of the screen, counted along the frames. */
	frameAt(clientX: number): number {
		const { left } = this.#ruler.getBoundingClientRect();
		const width = Number.parseFloat(this.#grid.style.getPropertyValue(TimelineProperty.FrameWidth)) || TimelineDisplay.DefaultFrameWidth;
		return Math.max(AnimationDefaults.FirstFrame, Math.floor((clientX - left) / width));
	}

	private renderActions(view: TimelinePanelView): void {
		for (const [command, button] of this.actionButtons) button.disabled = !view.available[command];
		const tweened = view.tween !== null;
		this.tweenButton.disabled = !view.available[tweened ? TimelineCommand.RemoveTween : TimelineCommand.CreateMotionTween];
		this.tweenButton.setAttribute('aria-pressed', String(tweened));
		this.tweenButton.title = tweened ? TimelineText.TweenOn : TimelineText.TweenOff;
		this.autoAnimateButton.setAttribute('aria-pressed', String(view.autoAnimate));
		this.#guide.textContent = view.guide;
	}

	/** The frame actions as labelled buttons, the tween and auto-animate switches, and the next step in plain words. */
	private createActions(): HTMLElement {
		const actions = document.createElement('div');
		actions.className = TimelineClass.Actions;
		this.#guide.className = TimelineClass.Guide;
		this.#guide.setAttribute('aria-live', 'polite');
		actions.append(group(...this.actionButtons.values()), group(this.tweenButton, this.autoAnimateButton), this.#guide);
		return actions;
	}

	private renderControls(view: TimelinePanelView): void {
		this.playButton.replaceChildren(createEditorIcon(view.playing ? EditorIconId.Pause : EditorIconId.Play));
		const label = playLabel(view.playing);
		this.playButton.title = label;
		this.playButton.setAttribute('aria-label', label);
		this.playButton.setAttribute('aria-pressed', String(view.playing));
		this.loopButton.setAttribute('aria-pressed', String(view.loop));
		this.onionButton.setAttribute('aria-pressed', String(view.onionSkin));
		showValue(this.frameInput, String(view.playhead + TimelineDisplay.FrameNumberOffset));
		this.frameInput.max = String(view.visibleFrames);
		this.#frameTotal.value = `${TimelineText.OfFrames}${view.frameCount}`;
		showValue(this.fpsInput, String(view.fps));
		showValue(this.zoomInput, String(view.frameWidth));
		this.renderTween(view.tween);
	}

	private renderTween(tween: Tween | null): void {
		this.#tweenGroup.hidden = tween === null;
		if (!tween) return;
		showValue(this.easeSelect, tween.ease.kind);
		this.easePointsInput.hidden = tween.ease.kind !== Ease.Custom;
		if (tween.ease.kind === Ease.Custom) showValue(this.easePointsInput, tween.ease.points.join(', '));
		showValue(this.rotateSelect, tween.rotate);
		showValue(this.extraTurnsInput, String(tween.extraTurns));
	}

	private createHeader(): HTMLElement {
		const header = document.createElement('header');
		header.className = TimelineClass.Header;
		const title = document.createElement('span');
		title.className = TimelineClass.Title;
		title.textContent = TimelineText.Title;
		const controls = this.#controls;
		controls.className = TimelineClass.Controls;
		numberInput(this.frameInput, TimelineDisplay.FrameNumberOffset, AnimationDefaults.MaximumFrames);
		this.#frameTotal.className = TimelineClass.Toggle;
		numberInput(this.fpsInput, AnimationDefaults.MinimumFps, AnimationDefaults.MaximumFps);
		this.zoomInput.type = 'range';
		this.zoomInput.min = String(TimelineDisplay.MinimumFrameWidth);
		this.zoomInput.max = String(TimelineDisplay.MaximumFrameWidth);
		const frame = group(labelled(TimelineText.Frame, this.frameInput), this.#frameTotal);
		controls.append(
			group(this.newLayerButton),
			group(this.playButton, this.loopButton, this.onionButton),
			frame,
			group(labelled(TimelineText.Fps, this.fpsInput)),
			this.createTweenControls(),
			group(labelled(TimelineText.Zoom, this.zoomInput)),
		);
		this.#collapseButton.type = 'button';
		this.#collapseButton.className = TimelineClass.Collapse;
		this.#collapseButton.title = TimelineText.Collapse;
		this.setCollapsed(false);
		header.append(title, controls, this.#collapseButton);
		return header;
	}

	private createTweenControls(): HTMLElement {
		for (const [ease, label] of Object.entries(EASE_LABELS)) this.easeSelect.append(new Option(label, ease));
		for (const [direction, label] of Object.entries(ROTATE_DIRECTION_LABELS)) this.rotateSelect.append(new Option(label, direction));
		this.easePointsInput.type = 'text';
		this.easePointsInput.spellcheck = false;
		this.easePointsInput.title = TimelineText.EasePoints;
		this.easePointsInput.setAttribute('aria-label', TimelineText.EasePoints);
		numberInput(this.extraTurnsInput, AnimationDefaults.MinimumExtraTurns, Number.MAX_SAFE_INTEGER);
		this.#tweenGroup.className = TimelineClass.TweenGroup;
		this.#tweenGroup.setAttribute('aria-label', TimelineText.Tween);
		this.#tweenGroup.append(
			labelled(TimelineText.Ease, this.easeSelect),
			this.easePointsInput,
			labelled(TimelineText.Rotate, this.rotateSelect),
			labelled(TimelineText.ExtraTurns, this.extraTurnsInput),
		);
		this.#tweenGroup.hidden = true;
		return this.#tweenGroup;
	}

	private createBody(): HTMLElement {
		const body = document.createElement('div');
		body.className = TimelineClass.Body;
		const scroll = document.createElement('div');
		scroll.className = TimelineClass.Scroll;
		this.#grid.className = TimelineClass.Grid;
		const rulerRow = document.createElement('div');
		rulerRow.className = TimelineClass.RulerRow;
		const corner = document.createElement('div');
		corner.className = TimelineClass.Corner;
		corner.textContent = TimelineText.Layers;
		this.#ruler.className = TimelineClass.Ruler;
		rulerRow.append(corner, this.#ruler);
		this.#rows.className = TimelineClass.Rows;
		this.#rows.setAttribute('role', 'grid');
		this.#rows.setAttribute('aria-label', TimelineText.Frames);
		const playhead = document.createElement('div');
		playhead.className = TimelineClass.Playhead;
		playhead.setAttribute('aria-hidden', 'true');
		this.#grid.append(rulerRow, this.#rows, playhead);
		scroll.append(this.#grid);
		body.append(scroll);
		this.bindScrubbing(this.#ruler, null);
		return body;
	}

	private renderRuler(count: number): void {
		const marks = Array.from({ length: count }, (_, frame) => {
			const mark = document.createElement('span');
			mark.className = TimelineClass.RulerMark;
			mark.dataset.frame = String(frame);
			const number = frame + TimelineDisplay.FrameNumberOffset;
			if (number === TimelineDisplay.FrameNumberOffset || number % TimelineDisplay.RulerLabelInterval === 0) mark.textContent = String(number);
			return mark;
		});
		this.#ruler.replaceChildren(...marks);
	}

	private row(layer: TimelineLayerView): HTMLElement {
		const entry = { kind: LayerListEntryKind.Layer, id: layer.id } as const;
		const row = document.createElement('div');
		row.className = TimelineClass.Row;
		row.setAttribute('role', 'row');
		markRowEntry(row, entry);
		row.classList.toggle(TimelineClass.Active, layer.active);
		row.classList.toggle(TimelineClass.Locked, layer.locked);
		const header = document.createElement('div');
		header.className = TimelineClass.Layer;
		const handle = layerIconButton(EditorIconId.Drag, `${TimelineText.DragLayer} ${layer.name}`, () => undefined);
		handle.className = TimelineClass.DragHandle;
		this.#drag.bind(handle, row, entry, layer.name);
		const name = layerActionButton(layer.name, layer.name, () => this.actions.pickFrame(layer.id, this.currentFrame()));
		name.className = LayerRowClass.Name;
		header.append(
			handle,
			layerVisibilityButton(layer.visible, layer.name, () => this.actions.toggleLayerVisible(layer.id)),
			name,
			layerLockButton(layer.locked, layer.name, () => this.actions.toggleLayerLocked(layer.id)),
		);
		const frames = document.createElement('div');
		frames.className = TimelineClass.Frames;
		frames.append(
			...layer.cells.map((cell, frame) => {
				const element = document.createElement('span');
				element.className = TimelineClass.Cell;
				element.setAttribute('role', 'gridcell');
				element.dataset.frame = String(frame);
				element.dataset.kind = cell.kind;
				if (cell.tween !== FrameTweenState.None) element.dataset.tween = cell.tween;
				return element;
			}),
		);
		this.bindScrubbing(frames, layer.id);
		frames.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			this.actions.openMenu(layer.id, this.frameAt(event.clientX), event.clientX, event.clientY);
		});
		row.append(header, frames);
		return row;
	}

	/** Pressing and dragging along `area` moves the playhead with the pointer. */
	private bindScrubbing(area: HTMLElement, layerId: string | null): void {
		area.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) return;
			this.#scrubbing = { layerId, pointerId: event.pointerId };
			area.setPointerCapture?.(event.pointerId);
			this.actions.pickFrame(layerId, this.frameAt(event.clientX));
		});
		area.addEventListener('pointermove', (event) => {
			if (this.#scrubbing?.pointerId !== event.pointerId) return;
			this.actions.pickFrame(this.#scrubbing.layerId, this.frameAt(event.clientX));
		});
		const finish = (event: PointerEvent) => {
			if (this.#scrubbing?.pointerId === event.pointerId) this.#scrubbing = null;
		};
		area.addEventListener('pointerup', finish);
		area.addEventListener('pointercancel', finish);
	}

	private currentFrame(): number {
		return Number(this.frameInput.value) - TimelineDisplay.FrameNumberOffset;
	}

	private drop(dragged: LayerListEntry, target: LayerListEntry): void {
		this.actions.moveLayer(dragged.id, target.id);
	}
}

/** The menu entries' names, by command. */
export const TIMELINE_COMMAND_LABELS: Readonly<Record<TimelineCommand, string>> = {
	[TimelineCommand.CreateMotionTween]: 'Create motion tween',
	[TimelineCommand.RemoveTween]: 'Remove tween',
	[TimelineCommand.InsertKeyframe]: 'Insert keyframe',
	[TimelineCommand.InsertBlankKeyframe]: 'Insert blank keyframe',
	[TimelineCommand.ClearKeyframe]: 'Remove keyframe',
	[TimelineCommand.InsertFrame]: 'Insert frame',
	[TimelineCommand.RemoveFrame]: 'Remove frame',
	[TimelineCommand.CopyFrames]: 'Copy frames',
	[TimelineCommand.PasteFrames]: 'Paste frames',
	[TimelineCommand.PreviousFrame]: 'Previous frame',
	[TimelineCommand.NextFrame]: 'Next frame',
	[TimelineCommand.TogglePlayback]: 'Play or pause',
};

/** The ease a tween control asks for: a named one, or a custom one from its control points. */
export function easeFromControls(kind: string, points: readonly number[]): EaseSpec | null {
	const ease = Object.values(Ease).find((value) => value === kind);
	if (!ease) return null;
	if (ease !== Ease.Custom) return { kind: ease };
	const [x1, y1, x2, y2] = points;
	return [x1, y1, x2, y2].every((value) => value !== undefined && Number.isFinite(value)) ? { kind: ease, points: [x1!, y1!, x2!, y2!] } : null;
}

/** The rotate direction a control asks for. */
export function rotateDirectionFromControl(value: string): RotateDirection | null {
	return Object.values(RotateDirection).find((direction) => direction === value) ?? null;
}

/** A line saying how to start. */
function hint(text: string): HTMLElement {
	const element = document.createElement('p');
	element.className = TimelineClass.Empty;
	element.textContent = text;
	return element;
}

/** A labelled frame action, its key shown in its tooltip. */
function actionButton(label: string, command: TimelineCommand | null): HTMLButtonElement {
	const shortcut = command ? timelineShortcutLabel(command) : '';
	const button = layerActionButton(label, shortcut ? `${label} (${shortcut})` : label, () => undefined);
	button.className = TimelineClass.Action;
	if (command) button.dataset.command = command;
	return button;
}

function playLabel(playing: boolean): string {
	return `${playing ? TimelineText.Pause : TimelineText.Play} (${timelineShortcutLabel(TimelineCommand.TogglePlayback)})`;
}

function toggleButton(icon: EditorIconId, label: string): HTMLButtonElement {
	const button = layerIconButton(icon, label, () => undefined);
	button.className = TimelineClass.Toggle;
	button.setAttribute('aria-pressed', String(false));
	return button;
}

function numberInput(input: HTMLInputElement, minimum: number, maximum: number): void {
	input.type = 'number';
	input.min = String(minimum);
	input.max = String(maximum);
	input.step = '1';
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
	const label = document.createElement('label');
	const caption = document.createElement('span');
	caption.textContent = text;
	label.append(caption, control);
	return label;
}

function group(...children: HTMLElement[]): HTMLElement {
	const element = document.createElement('div');
	element.className = TimelineClass.Group;
	element.append(...children);
	return element;
}

/** Shows a value unless the control is being edited, so typing is not overwritten. */
function showValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
	if (document.activeElement !== control) control.value = value;
}
