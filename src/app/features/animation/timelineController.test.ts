import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ShapeToolId } from '../../core/document/appTypes';
import type { KeyValueStorage } from '../../platform/editorPlatform';
import { KeyboardKey } from '../../shared/input/keyboardKeys';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { AnimationDocument } from './animationDocument';
import type { FrameScheduler } from './animationPlayer';
import { Ease, RotateDirection } from './animationTypes';
import { OnionSkinCanvas } from './onionSkin';
import { type TimelineDocumentSource, type TimelineLayout, TimelineController, TimelinePreference } from './timelineController';
import { easeFromControls, rotateDirectionFromControl } from './timelinePanel';
import { TimelineCommand, timelineCommandFor, timelineShortcutLabel } from './timelineShortcuts';
import { FrameCellKind, FrameTweenState, frameCells, TimelineDisplay } from './timelineView';

function box(id: string, x: number): ShapeAnnotation {
	return { id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, rect: { x, y: 0, width: 10, height: 10 }, color: '#000000', width: 1, opacity: 1, fill: false };
}

class MemoryStorage implements KeyValueStorage {
	readonly values = new Map<string, string>();
	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
	removeItem(key: string): void {
		this.values.delete(key);
	}
}

type DocumentSnapshot = Readonly<{ hasImage: boolean; width: number; height: number }>;
const SIZE = 20;

/** An editor document of a chosen type, opened and closed as the test says. */
class OpenDocument implements TimelineDocumentSource {
	hasImage = true;
	readonly #listeners = new Set<(snapshot: DocumentSnapshot) => void>();
	constructor(public documentType: DocumentType) {}
	onDocumentChange(listener: (snapshot: DocumentSnapshot) => void): void {
		this.#listeners.add(listener);
		listener(this.snapshot());
	}
	open(documentType: DocumentType): void {
		this.hasImage = true;
		this.documentType = documentType;
		this.#listeners.forEach((listener) => listener(this.snapshot()));
	}
	close(): void {
		this.hasImage = false;
		this.#listeners.forEach((listener) => listener(this.snapshot()));
	}
	private snapshot(): DocumentSnapshot {
		return { hasImage: this.hasImage, width: SIZE, height: SIZE };
	}
}

class ManualScheduler implements FrameScheduler {
	time = 0;
	callbacks: Array<(time: number) => void> = [];
	request(callback: (time: number) => void): number {
		this.callbacks.push(callback);
		return this.callbacks.length;
	}
	cancel(): void {
		this.callbacks = [];
	}
	now(): number {
		return this.time;
	}
	fireAt(time: number): void {
		this.time = time;
		const callbacks = this.callbacks;
		this.callbacks = [];
		for (const callback of callbacks) callback(time);
	}
}

function setup(stored: Record<string, string> = {}, documentType: DocumentType = DocumentType.Animation) {
	const objects = new AnnotationDocument();
	const animation = new AnimationDocument(objects);
	objects.add(box('a', 0));
	const storage = new MemoryStorage();
	for (const [key, value] of Object.entries(stored)) storage.setItem(key, value);
	const scheduler = new ManualScheduler();
	const onion = new OnionSkinCanvas(document.createElement('canvas'));
	onion.resize(20, 20);
	const openDocument = new OpenDocument(documentType);
	const timeline = new TimelineController(animation, objects, openDocument, storage, onion, scheduler);
	document.body.append(timeline.panel.element, timeline.menu.element);
	return { objects, animation, storage, scheduler, timeline, onion, openDocument, layerId: objects.activeLayer!.id };
}

const cells = (timeline: TimelineController) => [...timeline.panel.element.querySelectorAll<HTMLElement>('.timeline-row .timeline-cell')];
const control = <T extends Element>(timeline: TimelineController, selector: string) => timeline.panel.element.querySelector<T>(selector)!;

function pointer(type: string, target: Element, clientX: number, button = 0): void {
	const event = new MouseEvent(type, { bubbles: true, clientX, button });
	Object.defineProperty(event, 'pointerId', { value: 1 });
	target.dispatchEvent(event);
}

afterEach(() => {
	document.querySelectorAll('.timeline-dock, .timeline-context-menu').forEach((element) => element.remove());
});

describe('timeline shortcuts', () => {
	it('maps Flash keys to commands and labels them', () => {
		expect(timelineCommandFor(KeyboardKey.F6, false)).toBe(TimelineCommand.InsertKeyframe);
		expect(timelineCommandFor(KeyboardKey.F6, true)).toBe(TimelineCommand.ClearKeyframe);
		expect(timelineCommandFor(KeyboardKey.F7, false)).toBe(TimelineCommand.InsertBlankKeyframe);
		expect(timelineCommandFor(KeyboardKey.F5, false)).toBe(TimelineCommand.InsertFrame);
		expect(timelineCommandFor(KeyboardKey.F5, true)).toBe(TimelineCommand.RemoveFrame);
		expect(timelineCommandFor(KeyboardKey.Comma, false)).toBe(TimelineCommand.PreviousFrame);
		expect(timelineCommandFor(KeyboardKey.Period, false)).toBe(TimelineCommand.NextFrame);
		expect(timelineCommandFor(KeyboardKey.Enter, false)).toBe(TimelineCommand.TogglePlayback);
		expect(timelineCommandFor('x', false)).toBeNull();
		expect(timelineShortcutLabel(TimelineCommand.RemoveFrame)).toBe('Shift+F5');
		expect(timelineShortcutLabel(TimelineCommand.CopyFrames)).toBe('');
	});
});

describe('timeline view', () => {
	it('shows keyframes as dots, held frames plain and tweens as arrow spans', () => {
		const layer = {
			length: 6,
			keyframes: [
				{ frame: 0, items: [box('a', 0)], tween: { kind: 'motion' as const, ease: { kind: Ease.Linear }, rotate: RotateDirection.Auto, extraTurns: 0 } },
				{ frame: 3, items: [], tween: { kind: 'motion' as const, ease: { kind: Ease.Linear }, rotate: RotateDirection.Auto, extraTurns: 0 } },
			],
		};
		const view = frameCells(layer, 8);
		expect(view.map(({ kind }) => kind)).toEqual([
			FrameCellKind.Keyframe,
			FrameCellKind.Held,
			FrameCellKind.Held,
			FrameCellKind.EmptyKeyframe,
			FrameCellKind.Held,
			FrameCellKind.Held,
			FrameCellKind.Empty,
			FrameCellKind.Empty,
		]);
		expect(view.map(({ tween }) => tween).slice(0, 7)).toEqual([
			FrameTweenState.Tweened,
			FrameTweenState.Tweened,
			FrameTweenState.Tweened,
			FrameTweenState.Broken,
			FrameTweenState.Broken,
			FrameTweenState.Broken,
			FrameTweenState.None,
		]);
	});

	it('reads tween settings from its controls', () => {
		expect(easeFromControls(Ease.EaseIn, [])).toEqual({ kind: Ease.EaseIn });
		expect(easeFromControls(Ease.Custom, [0.1, 0.2, 0.3, 0.4])).toEqual({ kind: Ease.Custom, points: [0.1, 0.2, 0.3, 0.4] });
		expect(easeFromControls(Ease.Custom, [0.1, Number.NaN])).toBeNull();
		expect(easeFromControls('bounce', [])).toBeNull();
		expect(rotateDirectionFromControl(RotateDirection.Clockwise)).toBe(RotateDirection.Clockwise);
		expect(rotateDirectionFromControl('sideways')).toBeNull();
	});
});

describe('timeline controller', () => {
	it('is shown exactly while an animation is open, and only then takes its keys', () => {
		const { timeline, animation, openDocument } = setup({}, DocumentType.Image);
		const layouts: TimelineLayout[] = [];
		timeline.onLayoutChange((layout) => layouts.push(layout));
		expect(timeline.visible).toBe(false);
		expect(timeline.panel.element.hidden).toBe(true);
		expect(timeline.handleShortcut(KeyboardKey.F5, false)).toBe(false);
		openDocument.open(DocumentType.Svg);
		expect(timeline.visible).toBe(false);
		openDocument.open(DocumentType.Animation);
		expect(timeline.visible).toBe(true);
		expect(timeline.handleShortcut(KeyboardKey.F5, false)).toBe(true);
		expect(animation.frameCount).toBe(2);
		expect(timeline.handleShortcut('q', false)).toBe(false);
		openDocument.open(DocumentType.Animation);
		openDocument.close();
		expect(timeline.handleShortcut(KeyboardKey.F5, false)).toBe(false);
		expect(layouts.map(({ visible }) => visible)).toEqual([false, true, false]);
		control<HTMLButtonElement>(timeline, '.timeline-header .collapse').click();
		expect(layouts.at(-1)).toEqual({ visible: false, collapsed: true });
	});

	it('draws a row per layer with its frames, and moves the playhead from the frames and the ruler', () => {
		const { timeline, animation, objects, layerId } = setup();
		const rows = timeline.panel.element.querySelectorAll('.timeline-row');
		expect(rows).toHaveLength(1);
		expect(cells(timeline)).toHaveLength(TimelineDisplay.MinimumVisibleFrames);
		expect(cells(timeline)[0]!.dataset.kind).toBe(FrameCellKind.Keyframe);
		const frames = control<HTMLElement>(timeline, '.timeline-frames');
		pointer('pointerdown', frames, 3 * TimelineDisplay.DefaultFrameWidth + 1);
		expect(animation.playhead).toBe(3);
		pointer('pointermove', frames, 5 * TimelineDisplay.DefaultFrameWidth + 1);
		expect(animation.playhead).toBe(5);
		pointer('pointerup', frames, 0);
		pointer('pointermove', frames, 9 * TimelineDisplay.DefaultFrameWidth + 1);
		expect(animation.playhead).toBe(5);
		pointer('pointerdown', frames, 0, 2);
		expect(animation.playhead).toBe(5);
		const ruler = control<HTMLElement>(timeline, '.timeline-ruler');
		pointer('pointerdown', ruler, 1);
		expect(animation.playhead).toBe(0);
		pointer('pointercancel', ruler, 0);
		expect(control<HTMLElement>(timeline, '.timeline-ruler-mark').textContent).toBe('1');
		expect(cells(timeline)[0]!.classList.contains('current')).toBe(true);
		control<HTMLButtonElement>(timeline, '.timeline-layer .layer-name').click();
		expect(objects.activeLayer?.id).toBe(layerId);
	});

	it('runs every command, each edit one undo step', () => {
		const { timeline, animation, objects, layerId } = setup();
		timeline.run(TimelineCommand.InsertFrame);
		timeline.run(TimelineCommand.NextFrame);
		timeline.run(TimelineCommand.InsertKeyframe);
		timeline.run(TimelineCommand.PreviousFrame);
		timeline.run(TimelineCommand.CreateMotionTween);
		expect(animation.activeTween()).not.toBeNull();
		expect(cells(timeline)[0]!.dataset.tween).toBe(FrameTweenState.Tweened);
		timeline.run(TimelineCommand.RemoveTween);
		timeline.run(TimelineCommand.CopyFrames);
		animation.goToFrame(4);
		timeline.run(TimelineCommand.PasteFrames);
		timeline.run(TimelineCommand.InsertBlankKeyframe);
		timeline.run(TimelineCommand.ClearKeyframe);
		timeline.run(TimelineCommand.RemoveFrame);
		expect(animation.timeline!.layers[layerId]!.keyframes.map(({ frame }) => frame)).toEqual([0, 1]);
		const depth = objects.undoDepth;
		expect(depth).toBeGreaterThanOrEqual(7);
		objects.undo();
		expect(objects.undoDepth).toBe(depth - 1);
	});

	it('offers the frame actions in a context menu, those that change nothing turned off', () => {
		const { timeline, animation } = setup();
		const frames = control<HTMLElement>(timeline, '.timeline-frames');
		frames.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 1, clientY: 1 }));
		expect(timeline.menu.open).toBe(true);
		const item = (command: TimelineCommand) => timeline.menu.element.querySelector<HTMLButtonElement>(`[data-command="${command}"]`)!;
		expect(item(TimelineCommand.RemoveTween).disabled).toBe(true);
		expect(item(TimelineCommand.ClearKeyframe).disabled).toBe(true);
		expect(item(TimelineCommand.PasteFrames).disabled).toBe(true);
		expect(item(TimelineCommand.InsertFrame).querySelector('kbd')!.textContent).toBe('F5');
		expect(timeline.menu.element.querySelectorAll('.menu-rule')).toHaveLength(3);
		item(TimelineCommand.CreateMotionTween).click();
		expect(timeline.menu.open).toBe(false);
		expect(animation.activeTween()).not.toBeNull();
		frames.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 1, clientY: 1 }));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: KeyboardKey.Tab }));
		expect(timeline.menu.open).toBe(true);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: KeyboardKey.Escape }));
		expect(timeline.menu.open).toBe(false);
		frames.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 1, clientY: 1 }));
		timeline.menu.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
		expect(timeline.menu.open).toBe(true);
		document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
		expect(timeline.menu.open).toBe(false);
		timeline.menu.close();
		timeline.setVisible(false);
		expect(timeline.menu.open).toBe(false);
	});

	it('plays at the timeline rate, loops or plays once, and stops on an edit', () => {
		const { timeline, animation, scheduler, objects, storage } = setup();
		timeline.run(TimelineCommand.InsertFrame);
		timeline.run(TimelineCommand.InsertFrame);
		const play = control<HTMLButtonElement>(timeline, '.timeline-group button[aria-label^="Play"]');
		play.click();
		expect(timeline.playing).toBe(true);
		expect(play.getAttribute('aria-pressed')).toBe('true');
		scheduler.fireAt(1000 / 24);
		expect(animation.playhead).toBe(1);
		scheduler.fireAt((4 * 1000) / 24);
		expect(animation.playhead).toBe(1);
		objects.move('a', { x: 1, y: 0 });
		expect(timeline.playing).toBe(false);
		control<HTMLButtonElement>(timeline, '[aria-label="Loop playback"]').click();
		expect(storage.getItem(TimelinePreference.Loop)).toBe('false');
		animation.goToFrame(0);
		timeline.run(TimelineCommand.TogglePlayback);
		scheduler.fireAt(scheduler.time + 10_000);
		expect(timeline.playing).toBe(false);
		expect(animation.playhead).toBe(2);
		timeline.run(TimelineCommand.TogglePlayback);
		timeline.run(TimelineCommand.InsertFrame);
		expect(timeline.playing).toBe(false);
	});

	it('edits frame, fps, zoom and tween settings from its header', () => {
		const { timeline, animation, storage } = setup({ [TimelinePreference.FrameWidth]: '99' });
		const frameInput = timeline.panel.frameInput;
		frameInput.value = '7';
		frameInput.dispatchEvent(new Event('change'));
		expect(animation.playhead).toBe(6);
		timeline.panel.fpsInput.value = '30';
		timeline.panel.fpsInput.dispatchEvent(new Event('change'));
		expect(animation.timeline!.fps).toBe(30);
		timeline.panel.fpsInput.value = '30';
		timeline.panel.fpsInput.dispatchEvent(new Event('change'));
		expect(timeline.panel.zoomInput.value).toBe(String(TimelineDisplay.MaximumFrameWidth));
		timeline.panel.zoomInput.value = '8';
		timeline.panel.zoomInput.dispatchEvent(new Event('input'));
		expect(storage.getItem(TimelinePreference.FrameWidth)).toBe('8');
		const tweenGroup = control<HTMLElement>(timeline, '.timeline-tween');
		expect(tweenGroup.hidden).toBe(true);
		timeline.panel.easeSelect.dispatchEvent(new Event('change'));
		animation.goToFrame(0);
		timeline.run(TimelineCommand.CreateMotionTween);
		expect(tweenGroup.hidden).toBe(false);
		timeline.panel.easeSelect.value = Ease.Custom;
		timeline.panel.easeSelect.dispatchEvent(new Event('change'));
		expect(animation.activeTween()!.ease).toEqual({ kind: Ease.Custom, points: [0.25, 0.1, 0.25, 1] });
		expect(timeline.panel.easePointsInput.hidden).toBe(false);
		timeline.panel.easePointsInput.value = '0.4, 0, 0.6, 1';
		timeline.panel.easePointsInput.dispatchEvent(new Event('change'));
		expect(animation.activeTween()!.ease).toEqual({ kind: Ease.Custom, points: [0.4, 0, 0.6, 1] });
		timeline.panel.easeSelect.value = Ease.Custom;
		timeline.panel.easePointsInput.value = '';
		timeline.panel.easePointsInput.dispatchEvent(new Event('change'));
		expect(animation.activeTween()!.ease).toEqual({ kind: Ease.Custom, points: [0.4, 0, 0.6, 1] });
		timeline.panel.rotateSelect.value = RotateDirection.CounterClockwise;
		timeline.panel.extraTurnsInput.value = '2.7';
		timeline.panel.extraTurnsInput.dispatchEvent(new Event('change'));
		expect(animation.activeTween()).toMatchObject({ rotate: RotateDirection.CounterClockwise, extraTurns: 2 });
		timeline.panel.extraTurnsInput.value = 'x';
		timeline.panel.extraTurnsInput.dispatchEvent(new Event('change'));
		expect(animation.activeTween()!.extraTurns).toBe(2);
	});

	it('toggles onion skin, collapses, closes, and reorders, shows and locks layers from its rows', () => {
		const { timeline, objects, onion, storage, openDocument } = setup({ [TimelinePreference.Collapsed]: 'true' });
		expect(timeline.panel.collapsed).toBe(true);
		const render = vi.spyOn(onion, 'render');
		control<HTMLButtonElement>(timeline, '.timeline-header .collapse').click();
		expect(timeline.panel.collapsed).toBe(false);
		expect(storage.getItem(TimelinePreference.Collapsed)).toBe('false');
		const onionButton = control<HTMLButtonElement>(timeline, '[aria-label^="Onion skin"]');
		onionButton.click();
		expect(onionButton.getAttribute('aria-pressed')).toBe('true');
		expect(render).toHaveBeenLastCalledWith(objects.state);
		const second = objects.createLayer();
		const [top, bottom] = [...timeline.panel.element.querySelectorAll<HTMLElement>('.timeline-row')];
		expect(top!.dataset.entryId).toBe(second);
		top!.querySelector<HTMLButtonElement>('.layer-visibility')!.click();
		expect(objects.layer(second)!.visible).toBe(false);
		timeline.panel.element.querySelector<HTMLButtonElement>('.timeline-row .layer-visibility')!.click();
		expect(objects.layer(second)!.visible).toBe(true);
		timeline.panel.element.querySelector<HTMLButtonElement>('.timeline-row .layer-lock')!.click();
		expect(objects.layer(second)!.locked).toBe(true);
		const handle = timeline.panel.element.querySelector<HTMLElement>('.timeline-row .layer-drag-handle')!;
		const lowest = [...timeline.panel.element.querySelectorAll<HTMLElement>('.timeline-row')].at(-1)!;
		expect(lowest.dataset.entryId).toBe(bottom!.dataset.entryId);
		const elementFromPoint = vi.fn().mockReturnValue(lowest);
		Object.defineProperty(document, 'elementFromPoint', { value: elementFromPoint, configurable: true });
		Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
		pointer('pointerdown', handle, 0);
		pointer('pointerup', handle, 0);
		expect(objects.state.layers.at(0)!.id).toBe(second);
		openDocument.open(DocumentType.Image);
		expect(timeline.visible).toBe(false);
		expect(render).toHaveBeenLastCalledWith(null);
	});
});

describe('onion skin', () => {
	it('draws the frames around the playhead, farthest first and fainter', async () => {
		const { onionSkinFrames, OnionSkinTint } = await import('./onionSkin');
		expect(onionSkinFrames(1, 3)).toEqual([
			{ frame: 0, tint: OnionSkinTint.Before, opacity: 0.4 },
			{ frame: 2, tint: OnionSkinTint.After, opacity: 0.4 },
		]);
		expect(onionSkinFrames(5, 10).map(({ frame, opacity }) => [frame, opacity])).toEqual([
			[3, 0.2],
			[4, 0.4],
			[7, 0.2],
			[6, 0.4],
		]);
		const { objects, animation, onion } = setup();
		animation.insertFrame();
		const drawImage = vi.spyOn(onion.canvas.getContext('2d')!, 'drawImage');
		onion.render(objects.state);
		expect(drawImage).toHaveBeenCalledTimes(1);
		onion.render(null);
		expect(drawImage).toHaveBeenCalledTimes(1);
	});
});

describe('a document without layers', () => {
	it('says how to start, and adds a layer from the timeline', () => {
		const objects = new AnnotationDocument();
		const timeline = new TimelineController(new AnimationDocument(objects), objects, new OpenDocument(DocumentType.Animation), new MemoryStorage(), null, new ManualScheduler());
		expect(timeline.panel.element.querySelector('.timeline-empty')).not.toBeNull();
		expect(control<HTMLElement>(timeline, '.timeline-grid').classList.contains('empty')).toBe(true);
		timeline.panel.newLayerButton.click();
		expect(objects.state.layers).toHaveLength(1);
		expect(timeline.panel.element.querySelector('.timeline-empty')).toBeNull();
		expect(timeline.panel.element.querySelectorAll('.timeline-row')).toHaveLength(1);
	});
});
