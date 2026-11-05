import { describe, expect, it } from 'vitest';
import { DocumentType, ShapeToolId } from '../../core/document/appTypes';
import type { KeyValueStorage } from '../../platform/editorPlatform';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { AnimationDocument } from './animationDocument';
import { defaultMotionTween } from './animationTypes';
import { TimelineController, TimelinePreference, type TimelineDocumentSource } from './timelineController';
import { GUIDE_TEXT, GuideStep, guideStep } from './timelineGuide';
import { EditMode } from './timelineModel';
import { TimelineCommand } from './timelineShortcuts';

const ball: ShapeAnnotation = { id: 'ball', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Ellipse, rect: { x: 0, y: 0, width: 10, height: 10 }, color: '#000000', width: 1, opacity: 1, fill: true };

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

const animationOpen: TimelineDocumentSource = {
	hasImage: true,
	documentType: DocumentType.Animation,
	onDocumentChange: (listener) => listener({ hasImage: true, width: 1, height: 1 }),
};

function timeline(storage = new MemoryStorage()) {
	const objects = new AnnotationDocument();
	const animation = new AnimationDocument(objects);
	animation.start(24);
	const controller = new TimelineController(animation, objects, animationOpen, storage);
	const guide = () => controller.panel.element.querySelector('.timeline-guide')!.textContent;
	const button = (command: TimelineCommand) => controller.panel.element.querySelector<HTMLButtonElement>(`.timeline-action[data-command="${command}"]`)!;
	return { objects, animation, controller, guide, button, storage };
}

describe('the next step', () => {
	const facts = { playing: false, hasDrawing: true, keyframes: [{ frame: 0, tween: null }], playhead: 0, editMode: EditMode.AutoAnimate };

	it('leads from drawing to a later frame, a new pose, and playing', () => {
		expect(guideStep({ ...facts, hasDrawing: false })).toBe(GuideStep.Draw);
		expect(guideStep(facts)).toBe(GuideStep.PickLaterFrame);
		expect(guideStep({ ...facts, playhead: 9 })).toBe(GuideStep.ChangePose);
		expect(guideStep({ ...facts, keyframes: [] })).toBe(GuideStep.ChangePose);
		const posed = { ...facts, keyframes: [{ frame: 0, tween: defaultMotionTween() }, { frame: 9, tween: null }] };
		expect(guideStep(posed)).toBe(GuideStep.Play);
		expect(guideStep({ ...posed, playing: true })).toBe(GuideStep.Playing);
	});

	it('asks for a tween only where poses are not joined and the editor does not join them by itself', () => {
		const unjoined = { ...facts, keyframes: [{ frame: 0, tween: null }, { frame: 9, tween: null }] };
		expect(guideStep({ ...unjoined, editMode: EditMode.Hold })).toBe(GuideStep.AddTween);
		expect(guideStep(unjoined)).toBe(GuideStep.Play);
		expect(GUIDE_TEXT[GuideStep.ChangePose][EditMode.Hold]).toContain('Insert keyframe');
	});
});

describe('a friendly timeline', () => {
	it('says what to do next as the animation is made, and makes the tween by itself', () => {
		const { objects, animation, guide } = timeline();
		expect(guide()).toBe(GUIDE_TEXT[GuideStep.Draw][EditMode.AutoAnimate]);
		objects.add(ball);
		expect(guide()).toBe(GUIDE_TEXT[GuideStep.PickLaterFrame][EditMode.AutoAnimate]);
		animation.goToFrame(23);
		expect(guide()).toBe(GUIDE_TEXT[GuideStep.ChangePose][EditMode.AutoAnimate]);
		objects.move('ball', { x: 100, y: 0 });
		expect(guide()).toBe(GUIDE_TEXT[GuideStep.Play][EditMode.AutoAnimate]);
	});

	it('runs frame actions from labelled buttons, turning off those that would change nothing', () => {
		const { objects, animation, controller, button } = timeline();
		objects.add(ball);
		expect(button(TimelineCommand.InsertKeyframe).disabled).toBe(true);
		expect(button(TimelineCommand.InsertKeyframe).title).toBe('Insert keyframe (F6)');
		animation.goToFrame(5);
		button(TimelineCommand.InsertKeyframe).click();
		expect(animation.isKeyframeAt(5)).toBe(true);
		button(TimelineCommand.InsertFrame).click();
		button(TimelineCommand.RemoveFrame).click();
		button(TimelineCommand.InsertBlankKeyframe).click();
		expect(animation.frameCount).toBe(6);
		const tween = controller.panel.tweenButton;
		animation.goToFrame(0);
		tween.click();
		expect(animation.activeTween()).toEqual(defaultMotionTween());
		expect(tween.getAttribute('aria-pressed')).toBe('true');
		tween.click();
		expect(animation.activeTween()).toBeNull();
	});

	it('switches auto-animate off and on, remembering the choice', () => {
		const storage = new MemoryStorage();
		const { animation, controller } = timeline(storage);
		const auto = controller.panel.autoAnimateButton;
		expect(auto.getAttribute('aria-pressed')).toBe('true');
		auto.click();
		expect(animation.editMode).toBe(EditMode.Hold);
		expect(storage.getItem(TimelinePreference.EditMode)).toBe(EditMode.Hold);
		expect(auto.getAttribute('aria-pressed')).toBe('false');
		expect(timeline(storage).animation.editMode).toBe(EditMode.Hold);
		auto.click();
		expect(animation.editMode).toBe(EditMode.AutoAnimate);
	});
});
