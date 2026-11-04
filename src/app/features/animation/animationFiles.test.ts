import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import type { EditorPlatform, SaveTarget } from '../../platform/editorPlatform';
import { editorPlatform } from '../../platform/editorPlatform';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { FileController } from '../files/fileController';
import { ImageExportController } from '../files/imageExportController';
import { NewImageController } from '../files/newImageController';
import { AnimationDocument } from './animationDocument';
import { AnimationFileController, WRITE_WARNING_MESSAGES } from './animationFileController';
import { AnimationExportFormat } from './export/animationExportFormats';
import { ANIMATION_FILE_TYPE } from './format/animationFileFormat';
import { serializeAnimationFile, writeAnimationFile } from './format/animationFileWriter';
import { AnimationWriteWarning } from './format/animationFileWriter';

const ball: ShapeAnnotation = { id: 'ball', type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Ellipse, rect: { x: 10, y: 10, width: 20, height: 20 }, color: '#000000', width: 2, opacity: 1, fill: false };

function target(name: string) {
	const written: Blob[] = [];
	const file: SaveTarget = { name, createWritable: async () => ({ write: async (blob) => void written.push(blob), close: async () => undefined }) };
	return { file, written };
}

function editor(confirm = true) {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	const objects = new AnnotationDocument();
	const animation = new AnimationDocument(objects);
	const alert = vi.fn();
	const { files } = editorPlatform();
	const platform: Pick<EditorPlatform, 'files' | 'dialogs'> = { files, dialogs: { alert, confirm: vi.fn().mockResolvedValue(confirm), prompt: vi.fn().mockResolvedValue(null) } };
	const controller = new FileController(model, undefined, platform);
	const animationFiles = new AnimationFileController(model, objects, platform);
	controller.setAnimationDocument(animationFiles);
	return { model, objects, animation, files: controller, animationFiles, platform, alert };
}

function animated(confirm = true) {
	const made = editor(confirm);
	made.model.create({ name: 'bounce', width: 60, height: 40, transparent: false, background: '#ffffff', documentType: DocumentType.Animation });
	made.animation.start(10);
	made.objects.add(ball);
	return made;
}

const picking = (file: SaveTarget) => {
	Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: vi.fn().mockResolvedValue(file) });
};

describe('animation files in the editor', () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
	});
	afterEach(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
	});

	it('saves an animation as an animation file, which Save then keeps writing to', async () => {
		const { files, model } = animated();
		const { file, written } = target('bounce.anim.json');
		picking(file);
		await files.save();
		expect(written).toHaveLength(1);
		expect(JSON.parse(await written[0]!.text()).format).toBe('little-animation');
		expect(model.fileHandle).toBe(file);
		expect(model.documentType).toBe(DocumentType.Animation);
		expect(model.baseName).toBe('bounce');
		await files.save();
		expect(written).toHaveLength(2);
	});

	it('asks before saving what the file will not keep, and saves nothing when declined', async () => {
		const { files, model } = animated(false);
		const painted = new Uint8ClampedArray(model.width * model.height * 4).fill(255);
		painted.set([0, 0, 0, 255]);
		vi.spyOn(model.context, 'getImageData').mockReturnValue(new ImageData(painted, model.width, model.height));
		const { file, written } = target('bounce.anim.json');
		await files.saveInto(file).catch(() => undefined);
		expect(written).toEqual([]);
		expect(WRITE_WARNING_MESSAGES[AnimationWriteWarning.StagePixels]).toContain('Continue?');
	});

	it('opens an animation file as the animation it was saved from', async () => {
		const first = animated();
		const text = serializeAnimationFile((await writeAnimationFile(first.model, first.objects.state)).file);
		const second = editor();
		await second.files.openFile(new File([text], 'bounce.anim.json'));
		expect(second.model.documentType).toBe(DocumentType.Animation);
		expect(second.model.baseName).toBe('bounce');
		expect(second.objects.state.objects.map(({ id }) => id)).toEqual(['ball']);
		expect(second.alert).not.toHaveBeenCalled();
	});

	it('says why a file cannot be opened, and what opening left out', async () => {
		const { files, alert, model } = editor();
		await files.openFile(new File(['{"format":"little-animation","version":7}'], 'later.anim.json'));
		expect(alert.mock.calls[0]![0]).toContain('version this editor does not know: 7');
		await files.openFile(new File(['not json'], 'broken.anim.json'));
		expect(alert.mock.calls[1]![0]).toContain('not JSON');
		const withInstance = {
			format: 'little-animation',
			version: 1,
			stage: { width: 10, height: 10, background: null, fps: 12, frames: 1 },
			library: [{ id: 's', name: 'S', frames: 1, timeline: { layers: [], labels: [] } }],
			timeline: {
				layers: [
					{
						id: 'l',
						name: 'L',
						visible: true,
						locked: false,
						opacity: 1,
						blendMode: 'normal',
						length: 1,
						keyframes: [{ frame: 0, items: [{ id: 'i', transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, pivot: { x: 0, y: 0 } }, opacity: 1, visible: true, kind: 'instance', symbol: 's', play: 'loop', firstFrame: 0, tint: null }], tween: null }],
					},
				],
				labels: [],
			},
		};
		await files.openFile(new File([JSON.stringify(withInstance)], 'symbols.anim.json'));
		expect(alert.mock.calls[2]![0]).toContain('symbols');
		expect(model.documentType).toBe(DocumentType.Animation);
		const rejecting = new AnimationFileController(model, new AnnotationDocument(), { dialogs: { alert, confirm: vi.fn(), prompt: vi.fn() } });
		await rejecting.open({ name: 'x.anim.json', text: () => Promise.reject(new Error('unreadable')) } as unknown as File, null);
		expect(alert.mock.calls.at(-1)![0]).toBe('The animation could not be opened.');
	});

	it('exports a GIF or a video through the exporter, after the file is chosen', async () => {
		const { files } = animated();
		const exporter = { supports: vi.fn().mockReturnValue(true), export: vi.fn().mockResolvedValue(new Blob(['GIF89a'])) };
		files.setAnimationExporter(exporter);
		const { file, written } = target('bounce.gif');
		picking(file);
		await files.exportImage(AnimationExportFormat.Gif, { scale: 1 });
		expect(exporter.export).toHaveBeenCalledWith(AnimationExportFormat.Gif, { scale: 1 });
		expect(written).toHaveLength(1);
		exporter.supports.mockReturnValue(false);
		await files.exportImage(AnimationExportFormat.Webm);
		expect(exporter.export).toHaveBeenCalledOnce();
	});
});

describe('exporting an animation from the Export dialog', () => {
	it('offers GIF and video first for an animation, and only pictures for an image', () => {
		const { model, files } = animated();
		const exportImage = vi.spyOn(files, 'exportImage').mockResolvedValue(undefined);
		const dialog = new ImageExportController(model, files, undefined, { supports: (format) => format === AnimationExportFormat.Gif });
		vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(() => undefined);
		dialog.open();
		const format = document.querySelector<HTMLSelectElement>('#exportImageFormat')!;
		expect(format.value).toBe(AnimationExportFormat.Gif);
		expect([...format.options].map(({ value }) => value)).not.toContain(AnimationExportFormat.Webm);
		expect(document.querySelector('#exportImageFormatHint')!.textContent).toContain('animated GIF');
		expect(document.querySelector('#confirmExportImageButton')!.textContent).toBe('Export Animated GIF…');
		document.querySelector<HTMLFormElement>('#exportImageDialog form')!.dispatchEvent(new SubmitEvent('submit', { submitter: document.querySelector<HTMLButtonElement>('#confirmExportImageButton') }));
		expect(exportImage).toHaveBeenCalledWith(AnimationExportFormat.Gif, expect.objectContaining({ scale: 1 }));
		model.documentType = DocumentType.Image;
		dialog.open();
		expect([...format.options].map(({ value }) => value)).not.toContain(AnimationExportFormat.Gif);
	});
});

describe('the New animation dialog', () => {
	it('asks for a frame rate, titled for an animation, and says so to listeners', () => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		const dialog = new NewImageController(model);
		vi.spyOn(dialog.dialog, 'showModal').mockImplementation(() => undefined);
		const created = vi.fn();
		dialog.onCreate(created);
		document.querySelector<HTMLButtonElement>('#newAnimationButton')!.click();
		expect(document.querySelector('#newImageTitle')!.textContent).toBe('New animation');
		expect(document.querySelector('#newAnimationFps')!.closest('label')!.classList.contains('hidden')).toBe(false);
		document.querySelector<HTMLInputElement>('#newAnimationFps')!.value = '15';
		document.querySelector<HTMLButtonElement>('#createImageButton')!.click();
		expect(model.documentType).toBe(DocumentType.Animation);
		expect(created).toHaveBeenCalledWith(expect.objectContaining({ documentType: DocumentType.Animation, fps: 15 }));
		dialog.open();
		expect(document.querySelector('#newImageTitle')!.textContent).toBe('New image');
		expect(document.querySelector<HTMLSelectElement>('#newImageFormat')!.value).not.toBe(ANIMATION_FILE_TYPE);
		document.querySelector<HTMLButtonElement>('#quickNewAnimationButton')!.click();
		expect(document.querySelector('#newImageTitle')!.textContent).toBe('New animation');
		dialog.open();
		dialog.open('walk.anim.json');
		expect(document.querySelector<HTMLSelectElement>('#newImageFormat')!.value).toBe(ANIMATION_FILE_TYPE);
		expect(document.querySelector('#newImageTitle')!.textContent).toBe('New animation');
	});
});
