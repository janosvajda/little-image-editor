import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ShapeToolId } from '../../../core/document/appTypes';
import { CanvasDocument } from '../../../core/document/imageDocument';
import { CoreLayerId } from '../../../core/layers/layerTypes';
import { AnnotationDocument } from '../../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../../annotations/annotationTypes';
import { AnimationDocument } from '../animationDocument';
import { KeyframeContent } from '../timelineModel';
import { documentFrames, frameStart } from './animationFrames';
import { AnimationExportFormat, isAnimationExportFormat } from './animationExportFormats';
import { AnimationExporter } from './animationExporter';
import { type MediaEnvironment, recordWebm, supportedWebmType } from './webmRecorder';

const ball: ShapeAnnotation = { id: 'ball', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Ellipse, rect: { x: 2, y: 2, width: 6, height: 6 }, color: '#000000', width: 1, opacity: 1, fill: true };

function animation() {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'tiny', width: 10, height: 10, transparent: true, background: '#ffffff', documentType: DocumentType.Animation });
	const objects = new AnnotationDocument();
	const animated = new AnimationDocument(objects);
	animated.start(10);
	objects.add(ball);
	animated.goToFrame(2);
	animated.insertKeyframe(KeyframeContent.Copy);
	return { model, objects };
}

/** A recorder the test drives: it hands back one chunk when stopped. */
class FakeRecorder {
	static isTypeSupported = (type: string) => type === 'video/webm;codecs=vp8';
	readonly #listeners = new Map<string, (event: { data: Blob }) => void>();
	state = 'inactive';
	constructor(
		readonly stream: MediaStream,
		readonly options: MediaRecorderOptions,
	) {}
	addEventListener(type: string, listener: (event: { data: Blob }) => void): void {
		this.#listeners.set(type, listener);
	}
	start(): void {
		this.state = 'recording';
	}
	stop(): void {
		this.#listeners.get('dataavailable')?.({ data: new Blob(['webm-bytes']) });
		this.#listeners.get('dataavailable')?.({ data: new Blob([]) });
		this.#listeners.get('stop')?.({ data: new Blob([]) });
	}
}

/** A clock and recorder the test controls; `null` is a browser without a recorder. */
function fakeMedia(recorder: unknown = FakeRecorder): MediaEnvironment & { waits: number[] } {
	let time = 0;
	const waits: number[] = [];
	return {
		MediaRecorder: (recorder ?? undefined) as typeof MediaRecorder | undefined,
		now: () => time,
		wait: async (milliseconds) => {
			waits.push(milliseconds);
			time += Math.max(0, milliseconds);
		},
		waits,
	};
}

function stubCapture(): { requested: number } {
	const counter = { requested: 0 };
	const track = { requestFrame: () => void counter.requested++, stop: vi.fn() };
	Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
		configurable: true,
		value: () => ({ getVideoTracks: () => [track], getTracks: () => [track] }),
	});
	return counter;
}

afterEach(() => {
	Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream');
});

describe('animation export', () => {
	it('names its formats', () => {
		expect(isAnimationExportFormat(AnimationExportFormat.Gif)).toBe(true);
		expect(isAnimationExportFormat('image/png')).toBe(false);
	});

	it('exports a looping GIF of every frame', async () => {
		const { model, objects } = animation();
		const blob = await new AnimationExporter(model, objects, fakeMedia()).export(AnimationExportFormat.Gif, { scale: 1 });
		expect(blob.type).toBe(AnimationExportFormat.Gif);
		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
		const frames = String.fromCharCode(...bytes).split('\x21\xf9\x04').length - 1;
		expect(frames).toBe(3);
	});

	it('records a WebM video, handing each frame over when the animation reaches it', async () => {
		const { model, objects } = animation();
		const capture = stubCapture();
		const media = fakeMedia();
		const exporter = new AnimationExporter(model, objects, media);
		expect(exporter.supports(AnimationExportFormat.Webm)).toBe(true);
		const blob = await exporter.export(AnimationExportFormat.Webm, { scale: 2, background: '#000000' });
		expect(blob.type).toBe(AnimationExportFormat.Webm);
		expect(await blob.text()).toBe('webm-bytes');
		expect(capture.requested).toBe(3);
		expect(media.waits).toEqual([0, 100, 100, 100]);
		expect(frameStart(3, 10)).toBe(300);
	});

	it('says where video cannot be recorded', async () => {
		const { model, objects } = animation();
		expect(supportedWebmType(fakeMedia(null))).toBeNull();
		expect(new AnimationExporter(model, objects, fakeMedia(null)).supports(AnimationExportFormat.Webm)).toBe(false);
		await expect(recordWebm(documentFrames(model, objects.state), 1, '#ffffff', fakeMedia(null))).rejects.toThrow('cannot record WebM');
		Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getVideoTracks: () => [], getTracks: () => [] }) });
		await expect(recordWebm(documentFrames(model, objects.state), 1, '#ffffff', fakeMedia())).rejects.toThrow('could not be drawn');
	});

	it('draws frames as the document shows them, its hidden layers left out', () => {
		const { model, objects } = animation();
		const frames = documentFrames(model, objects.state);
		expect({ width: frames.width, height: frames.height, fps: frames.fps, count: frames.count }).toEqual({ width: 10, height: 10, fps: 10, count: 3 });
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;
		const drawImage = vi.spyOn(context, 'drawImage');
		frames.draw(context, 1, 1, null);
		expect(drawImage).toHaveBeenCalledWith(model.canvas, 0, 0);
		model.layers.setVisible(CoreLayerId.Image, false);
		drawImage.mockClear();
		frames.draw(context, 1, 1, '#ffffff');
		expect(drawImage).not.toHaveBeenCalledWith(model.canvas, 0, 0);
		const still = documentFrames(model, { ...objects.state, animation: undefined });
		expect(still.count).toBe(1);
		still.draw(context, 0, 1, null);
	});
});
