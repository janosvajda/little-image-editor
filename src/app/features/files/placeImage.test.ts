import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type RasterFragmentAnnotation } from '../annotations/annotationTypes';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { PICTURE_FILE_ACCEPT } from './openFileTypes';
import { PlaceImageController } from './placeImageController';
import { placedImageItem, placedRect } from './placedImage';

/** The test setup decodes every image as 20 × 10 pixels. */
const DECODED = { width: 20, height: 10 } as const;
const png = () => new File(['png'], 'logo.png', { type: 'image/png' });

let model: CanvasDocument;
let objects: AnnotationDocument;
let runner: AssistantCommandRunner;
beforeEach(() => {
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	objects = new AnnotationDocument();
	runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
});

describe('where a placed picture goes', () => {
	it('is centred at its own size when it fits, and fitted inside the image when larger', () => {
		expect(placedRect({ width: 100, height: 50 }, { width: 400, height: 300 })).toEqual({ x: 150, y: 125, width: 100, height: 50 });
		expect(placedRect({ width: 1000, height: 500 }, { width: 400, height: 300 })).toEqual({ x: 40, y: 70, width: 320, height: 160 });
	});

	it('goes where it is placed, its height following its width unless given', () => {
		expect(placedRect({ width: 100, height: 50 }, { width: 400, height: 300 }, { at: { x: 10, y: 20 }, width: 60 })).toEqual({ x: 10, y: 20, width: 60, height: 30 });
		expect(placedRect({ width: 100, height: 50 }, { width: 400, height: 300 }, { height: 25 })).toMatchObject({ width: 50, height: 25 });
		expect(placedRect({ width: 100, height: 50 }, { width: 400, height: 300 }, { width: 80, height: 80 })).toMatchObject({ width: 80, height: 80 });
	});

	it('becomes a pixel item keeping every pixel of the picture', async () => {
		const item = await placedImageItem(png(), { width: 400, height: 300 });
		expect(item).toMatchObject({ type: AnnotationObjectTypeId.RasterFragment, pixelWidth: DECODED.width, pixelHeight: DECODED.height, rect: { x: 190, y: 145, ...DECODED } });
	});
});

describe('placing a picture', () => {
	beforeEach(() => model.create({ name: 'board', width: 400, height: 300, transparent: false, background: '#ffffff' }));

	it('puts a file on the active layer, or on a named one, as one item', async () => {
		const placed = await runner.placeFile(png());
		expect(placed).toMatchObject({ itemId: expect.any(String), layerName: expect.any(String) });
		runner.run({ kind: AssistantCommandKind.AddLayer, name: 'Logos' });
		runner.run({ kind: AssistantCommandKind.AddLayer, name: 'Top' });
		await runner.placeFile(png(), {}, 'Logos');
		expect(objects.state.objects.filter(({ type }) => type === AnnotationObjectTypeId.RasterFragment)).toHaveLength(2);
		expect(objects.layerOf(objects.state.objects.at(-1)!.id)!.name).toBe('Logos');
	});

	it('places a picture an assistant sends in base64, where it asks, and runs it apart from immediate commands', async () => {
		const result = await runner.handle({ kind: AssistantCommandKind.PlaceImage, fileName: 'logo.png', contents: btoa('png'), at: { x: 5, y: 6 }, width: 40 });
		expect(result).toMatchObject({ itemId: expect.any(String) });
		expect(objects.state.objects[0]).toMatchObject({ rect: { x: 5, y: 6, width: 40, height: 20 } });
		expect(runner.handle({ kind: AssistantCommandKind.Describe })).toMatchObject({ document: expect.any(Object) });
	});

	it('refuses to place a picture where no image is open', async () => {
		model.close();
		await expect(runner.placeFile(png())).rejects.toThrow();
	});
});

describe('Place image…', () => {
	const choose = (file: File) => {
		const input = document.querySelector<HTMLInputElement>('#placeImageInput')!;
		Object.defineProperty(input, 'files', { configurable: true, value: [file] });
		input.dispatchEvent(new Event('change'));
	};

	it('opens a picture picker from the File menu and the toolbar, for pictures only', () => {
		new PlaceImageController(model, runner, vi.fn());
		const input = document.querySelector<HTMLInputElement>('#placeImageInput')!;
		const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
		document.querySelector<HTMLButtonElement>('#placeImageButton')!.click();
		document.querySelector<HTMLButtonElement>('#quickPlaceImageButton')!.click();
		expect(click).toHaveBeenCalledTimes(2);
		expect(input.accept).toBe(PICTURE_FILE_ACCEPT);
		expect(input.accept).not.toContain('limg');
	});

	it('places the chosen picture and hands it over to be selected', async () => {
		model.create({ name: 'board', width: 400, height: 300, transparent: false, background: '#ffffff' });
		const placed = vi.fn();
		new PlaceImageController(model, runner, placed);
		choose(png());
		await vi.waitFor(() => expect(placed).toHaveBeenCalledWith(objects.state.objects[0]!.id));
		expect((objects.state.objects[0] as RasterFragmentAnnotation).pixelWidth).toBe(DECODED.width);
	});

	it('opens the picture when no image is open, and says when a file cannot be placed', async () => {
		const alert = vi.fn();
		new PlaceImageController(model, runner, vi.fn(), { alert });
		choose(png());
		await vi.waitFor(() => expect(model.hasImage).toBe(true));
		expect(objects.state.objects).toHaveLength(0);
		vi.mocked(globalThis.createImageBitmap).mockRejectedValueOnce(new Error('broken'));
		choose(png());
		await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining('could not be placed')));
	});
});
