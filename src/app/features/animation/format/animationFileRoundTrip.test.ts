import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ShapeToolId } from '../../../core/document/appTypes';
import { CanvasDocument } from '../../../core/document/imageDocument';
import { linearGradient } from '../../../core/geometry/gradient';
import { AnnotationDocument } from '../../annotations/annotationDocument';
import { AnnotationObjectTypeId, LineDash, type PathAnnotation, type ShapeAnnotation, type TextAnnotation } from '../../annotations/annotationTypes';
import { DocumentStateAdapter } from '../../files/documentState';
import { AnimationDocument } from '../animationDocument';
import { Ease, RotateDirection, TweenKind } from '../animationTypes';
import { KeyframeContent } from '../timelineModel';
import { AnimationFileError, parseAnimationFile, readAnimationDocument } from './animationFileReader';
import { serializeAnimationFile, writeAnimationFile } from './animationFileWriter';
import { AnimItemKind } from './animationSchema';

function shape(id: string, x: number, overrides: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return { id, type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Ellipse, rect: { x, y: 20, width: 40, height: 30 }, color: '#1d4ed8', width: 3, opacity: 1, fill: true, fillColor: '#fbbf24', ...overrides };
}

const path: PathAnnotation = {
	id: 'path',
	type: AnnotationObjectTypeId.Path,
	contours: [{ closed: false, nodes: [{ point: { x: 10, y: 10 }, out: { x: 30, y: 0 } }, { point: { x: 60, y: 40 }, in: { x: 50, y: 50 } }] }],
	color: '#22c55e',
	width: 4,
	opacity: 0.8,
	fill: false,
	dash: LineDash.Solid,
};

const text: TextAnnotation = { id: 'title', type: AnnotationObjectTypeId.Text, at: { x: 20, y: 90 }, text: 'Hello', color: '#111111', size: 18 };

function editor() {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	const objects = new AnnotationDocument();
	const animation = new AnimationDocument(objects);
	return { model, objects, animation, adapter: new DocumentStateAdapter(model, objects) };
}

/** An animation with shapes, a path, text, a gradient, two layers, a hidden layer and a custom-eased tween. */
function animated() {
	const made = editor();
	const { model, objects, animation } = made;
	model.create({ name: 'scene', width: 160, height: 120, transparent: false, background: '#ffffff', documentType: DocumentType.Animation });
	animation.start(12);
	objects.add(shape('ball', 10, { pivot: { x: 0, y: 1 }, fillGradient: linearGradient(['#ff0000', '#0000ff']) }));
	objects.add(path);
	animation.goToFrame(8);
	animation.insertKeyframe(KeyframeContent.Copy);
	objects.move('ball', { x: 70, y: 30 });
	objects.update('ball', (item) => {
		item.rotation = 90;
	});
	animation.goToFrame(0);
	animation.setTween({ kind: TweenKind.Motion, ease: { kind: Ease.Custom, points: [0.3, 0, 0.7, 1] }, rotate: RotateDirection.CounterClockwise, extraTurns: 1 });
	const second = objects.createLayer();
	objects.add(text);
	objects.setLayerAppearance(second, { opacity: 0.5, name: 'Titles' });
	objects.setLayerVisible(second, false);
	return made;
}

describe('the animation file', () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
	});

	it('saves, opens and saves again to the same bytes', async () => {
		const first = animated();
		const written = serializeAnimationFile((await writeAnimationFile(first.model, first.objects.state)).file);
		const opened = await readAnimationDocument(written, 'scene');
		const second = editor();
		second.adapter.restore(opened.state);
		expect(second.model.documentType).toBe(DocumentType.Animation);
		const again = serializeAnimationFile((await writeAnimationFile(second.model, second.objects.state)).file);
		expect(again).toBe(written);
		expect(opened.warnings).toEqual([]);
	});

	it('opens as the same timeline, layers and items the editor saved', async () => {
		const { model, objects } = animated();
		const opened = await readAnimationDocument(serializeAnimationFile((await writeAnimationFile(model, objects.state)).file), 'scene');
		const state = opened.state.editableObjects.state;
		expect(state.layers.map(({ id, name, visible, opacity }) => ({ id, name, visible, opacity }))).toEqual(
			objects.state.layers.map(({ id, name, visible, opacity }) => ({ id, name, visible, opacity })),
		);
		const timeline = state.animation!;
		expect(timeline.fps).toBe(12);
		const [layerId] = objects.state.layers.map(({ id }) => id);
		expect(timeline.layers[layerId!]!.keyframes.map(({ frame }) => frame)).toEqual([0, 8]);
		expect(timeline.layers[layerId!]!.keyframes[0]!.tween).toEqual({ kind: TweenKind.Motion, ease: { kind: Ease.Custom, points: [0.3, 0, 0.7, 1] }, rotate: RotateDirection.CounterClockwise, extraTurns: 1 });
		const ball = timeline.layers[layerId!]!.keyframes[1]!.items.find(({ id }) => id === 'ball') as ShapeAnnotation;
		expect(ball.rect).toEqual({ x: 80, y: 50, width: 40, height: 30 });
		expect(ball.rotation).toBe(90);
		expect(ball.pivot).toEqual({ x: 0, y: 1 });
	});

	it('describes each item as paths, text and pictures in its own frame, with its pivot and frame size', async () => {
		const { model, objects } = animated();
		const { file } = await writeAnimationFile(model, objects.state);
		expect(file.stage).toEqual({ width: 160, height: 120, background: [1, 1, 1, 1], fps: 12, frames: 9 });
		const [shapes, titles] = file.timeline.layers;
		expect(titles!.visible).toBe(false);
		const ball = shapes!.keyframes[0]!.items.find(({ id }) => id === 'ball')!;
		expect(ball.kind).toBe(AnimItemKind.Path);
		expect(ball.frame).toEqual({ width: 40, height: 30 });
		expect(ball.transform).toMatchObject({ x: 10, y: 50, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, pivot: { x: 0, y: 30 } });
		expect(ball.kind === AnimItemKind.Path && ball.fill?.kind).toBe('linear');
		expect(ball.kind === AnimItemKind.Path && ball.stroke?.width).toBe(3);
		const turned = shapes!.keyframes[1]!.items.find(({ id }) => id === 'ball')!;
		expect(turned.transform.rotation).toBeCloseTo(Math.PI / 2, 6);
		// Text is placed at its baseline inside its frame, so it is the item's one child.
		const title = titles!.keyframes[0]!.items[0]!;
		expect(title.kind).toBe(AnimItemKind.Group);
		expect(title.kind === AnimItemKind.Group && title.items.map(({ kind }) => kind)).toEqual([AnimItemKind.Text]);
		expect(typeof title.editor).toBe('string');
	});

	it('warns before saving pixels painted on the stage, which only layers keep', async () => {
		const { model, objects } = animated();
		const painted = new Uint8ClampedArray(model.width * model.height * 4).fill(255);
		painted.set([0, 0, 0, 255]);
		vi.spyOn(model.context, 'getImageData').mockReturnValue(new ImageData(painted, model.width, model.height));
		const result = await writeAnimationFile(model, objects.state);
		expect(result.warnings).toEqual(['stagePixels']);
	});
});

describe('reading animation files', () => {
	it('says what is wrong with a file it cannot open', () => {
		const problems = (text: string) => {
			try {
				parseAnimationFile(text);
				return [];
			} catch (error) {
				return error instanceof AnimationFileError ? [...error.problems] : ['unexpected'];
			}
		};
		expect(problems('{')).toEqual(['The file is not JSON.']);
		expect(problems('{"format":"other"}')[0]).toContain('not an animation');
		expect(problems('{"format":"little-animation","version":2}')[0]).toContain('version this editor does not know: 2');
		expect(problems('{"format":"little-animation","version":1}').length).toBeGreaterThan(0);
	});
});
