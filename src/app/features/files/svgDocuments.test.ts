import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { SVG_MIME_TYPE } from '../../core/document/svgFormat';
import type { EditorPlatform, SaveTarget } from '../../platform/editorPlatform';
import { editorPlatform } from '../../platform/editorPlatform';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { FileController } from './fileController';
import { NewImageController } from './newImageController';
import { SVG_PICKER_TYPE, savePickerTypes } from './openFileTypes';
import { SvgDocumentController } from './svgDocumentController';
import { svgDocument } from './svgExport';
import { importSvg } from './svgImport';
import { dataUrlBlob, elementPicture, embeddedPictureItem } from './svgPictures';

const DRAWING = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><g><title>Shapes</title><rect x="10" y="10" width="40" height="20" fill="#ff0000"/></g></svg>';

/** jsdom draws no pictures; this one decodes as a browser's does, and keeps what it was asked to draw. */
function drawingPictures(): { drawn: Blob[] } {
	const drawn: Blob[] = [];
	class DecodingImage {
		src = '';
		constructor(
			readonly width: number,
			readonly height: number,
		) {}
		decode(): Promise<void> {
			return Promise.resolve();
		}
	}
	vi.stubGlobal('Image', DecodingImage);
	vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
		drawn.push(blob as Blob);
		return 'blob:svg';
	});
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
	return { drawn };
}

function target(name: string) {
	const written: Blob[] = [];
	const file: SaveTarget = { name, createWritable: async () => ({ write: async (blob) => void written.push(blob), close: async () => undefined }) };
	return { file, written };
}

function editor(confirm = true) {
	const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	const objects = new AnnotationDocument();
	const alert = vi.fn();
	const { files } = editorPlatform();
	const platform: Pick<EditorPlatform, 'files' | 'dialogs'> = { files, dialogs: { alert, confirm: vi.fn().mockResolvedValue(confirm), prompt: vi.fn().mockResolvedValue(null) } };
	const controller = new FileController(model, undefined, platform);
	const svg = new SvgDocumentController(model, objects, platform);
	controller.setSvgDocument(svg);
	return { model, objects, files: controller, svg, platform, alert };
}

const picking = (file: SaveTarget) => {
	const picker = vi.fn().mockResolvedValue(file);
	Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker });
	return picker;
};

beforeEach(() => {
	Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('an SVG document', () => {
	it('opens as editable layers, and Save writes it back into its SVG', async () => {
		const { model, objects, files } = editor();
		const svg = target('drawing.svg');
		await files.openFile(new File([DRAWING], 'drawing.svg', { type: SVG_MIME_TYPE }), svg.file);
		expect([model.documentType, model.baseName, model.width, model.height]).toEqual([DocumentType.Svg, 'drawing', 120, 80]);
		expect(model.fileHandle).toBe(svg.file);
		expect(objects.state.layers.map(({ name }) => name)).toEqual(['Shapes']);
		expect(objects.state.objects[0]).toMatchObject({ type: AnnotationObjectTypeId.Shape, shape: ShapeToolId.Rectangle, color: '#ff0000' });
		await files.save();
		expect(svg.written).toHaveLength(1);
		expect(svg.written[0]!.type).toBe(SVG_MIME_TYPE);
		expect(await svg.written[0]!.text()).toBe(svgDocument(model, objects.state));
	});

	it('is chosen a file in Save As, SVG offered first, and becomes the file Save writes to', async () => {
		const { model, files } = editor();
		model.create({ name: 'fresh', width: 10, height: 10, transparent: true, background: '#ffffff', documentType: DocumentType.Svg });
		const svg = target('fresh.svg');
		const picker = picking(svg.file);
		await files.save();
		expect(picker).toHaveBeenCalledWith({ suggestedName: 'fresh.svg', types: savePickerTypes(SVG_MIME_TYPE) });
		expect(savePickerTypes(SVG_MIME_TYPE)[0]).toBe(SVG_PICKER_TYPE);
		expect(svg.written).toHaveLength(1);
		expect([model.fileHandle, model.documentType]).toEqual([svg.file, DocumentType.Svg]);
	});

	it('asks before keeping pixel items only as pictures, and writes nothing when declined', async () => {
		const { model, objects, files, platform } = editor(false);
		model.create({ name: 'painted', width: 10, height: 10, transparent: true, background: '#ffffff' });
		objects.add({
			id: 'stroke',
			type: AnnotationObjectTypeId.Stroke,
			tool: PaintToolId.Brush,
			points: [{ x: 1, y: 1, pressure: 1 }],
			rect: { x: 0, y: 0, width: 2, height: 2 },
			color: '#000000',
			size: 2,
			opacity: 1,
			hardness: 1,
			seed: 1,
		});
		const svg = target('painted.svg');
		await expect(files.saveInto(svg.file)).rejects.toThrow();
		expect(platform.dialogs.confirm).toHaveBeenCalledWith(expect.stringContaining('.limg'));
		expect(svg.written).toEqual([]);
	});

	it('downloads where no file can be chosen, without keeping the download as its file', async () => {
		const { model, files, platform } = editor();
		model.create({ name: 'copy', width: 10, height: 10, transparent: true, background: '#ffffff', documentType: DocumentType.Svg });
		vi.mocked(platform.dialogs.prompt).mockResolvedValue('copy');
		const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
		await files.saveAs();
		expect(platform.dialogs.prompt).toHaveBeenCalledWith(expect.any(String), 'copy.svg');
		expect(download).toHaveBeenCalledOnce();
		expect(model.fileHandle).toBeNull();
	});

	it('says when a file cannot be saved or opened', async () => {
		const { model, files, alert } = editor();
		model.create({ name: 'any', width: 10, height: 10, transparent: true, background: '#ffffff' });
		await expect(files.saveInto(target('any.gif').file)).rejects.toThrow();
		expect(alert).toHaveBeenCalledWith(expect.stringContaining('SVG images'));
		await files.openFile(new File(['not svg'], 'broken.svg', { type: SVG_MIME_TYPE }));
		expect(alert).toHaveBeenCalledWith('The SVG could not be opened.');
	});

	it('opens through Open\'s file input as editable layers, and reports a file that cannot be opened', async () => {
		const { model, files, alert } = editor();
		const input = files.fileInput;
		Object.defineProperty(input, 'files', { configurable: true, value: [new File([DRAWING], 'picked.svg', { type: SVG_MIME_TYPE })] });
		input.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(model.documentType).toBe(DocumentType.Svg));
		vi.spyOn(files, 'openFile').mockRejectedValueOnce(new Error('broken'));
		input.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(alert).toHaveBeenCalledWith('The file could not be opened as an image or project.'));
	});

	it('keeps an image opened from a file as that file, so Save writes back into it', async () => {
		const { model, files } = editor();
		const png = target('photo.png');
		await files.openFile(new File(['png'], 'photo.png', { type: 'image/png' }), png.file);
		expect(model.fileHandle).toBe(png.file);
	});

	it('is a file type for new images, with what it keeps explained, and the one an .svg name asks for', () => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		const newImage = new NewImageController(model);
		const format = document.querySelector<HTMLSelectElement>('#newImageFormat')!;
		expect([...format.options].find(({ value }) => value === SVG_MIME_TYPE)!.text).toBe('SVG (.svg) — editable vectors');
		newImage.open('poster.svg');
		expect(format.value).toBe(SVG_MIME_TYPE);
		expect(document.querySelector('#newImageFileTypeWarning')!.textContent).toContain('editable vectors');
		document.querySelector<HTMLInputElement>('#newImageTransparent')!.click();
		expect(document.querySelector('#transparencyWarning')!.textContent).toContain('editable vectors');
		document.querySelector<HTMLButtonElement>('#createImageButton')!.click();
		expect(model.documentType).toBe(DocumentType.Svg);
		expect(model.baseName).toBe('poster');
	});
});

describe('arrows and layers in an SVG', () => {
	it('writes an arrow as a line with an arrowhead marker, turned as the arrow is, which opens again as a line with that end', async () => {
		const { model, objects } = editor();
		model.create({ name: 'arrow', width: 100, height: 100, transparent: true, background: '#ffffff' });
		objects.add({ id: 'arrow', type: AnnotationObjectTypeId.Arrow, from: { x: 10, y: 50 }, to: { x: 90, y: 50 }, rotation: 90, color: '#ff0000', width: 4 });
		const { editableObjects } = await importSvg(svgDocument(model, objects.state), 'arrow');
		const [line] = editableObjects.state.objects;
		expect(line).toMatchObject({ type: AnnotationObjectTypeId.Connector, head: 'arrow', color: '#ff0000', width: 4 });
		const points = (line as { points: { x: number; y: number }[] }).points;
		expect(points[0]!.x).toBeCloseTo(50);
		expect(points[0]!.y).toBeCloseTo(10);
		expect(points[1]!.y).toBeCloseTo(90);
	});

	it('keeps a layer whose transform cannot be read as a picture of the whole layer', async () => {
		drawingPictures();
		const { editableObjects } = await importSvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><g transform="wobble(2)"><rect width="5" height="5"/></g></svg>', 'odd');
		expect(editableObjects.state.objects.map(({ type }) => type)).toEqual([AnnotationObjectTypeId.RasterFragment]);
	});
});

describe('pictures in an SVG', () => {
	it('reads data addresses, encoded or not, and nothing else', async () => {
		expect(await dataUrlBlob('data:image/svg+xml,%3Csvg%2F%3E')!.text()).toBe('<svg/>');
		const encoded = dataUrlBlob('data:image/png;base64,QUJD')!;
		expect([encoded.type, await encoded.text()]).toEqual(['image/png', 'ABC']);
		expect(dataUrlBlob('data:,plain')!.type).toBe('text/plain');
		expect(dataUrlBlob('https://example.com/a.png')).toBeNull();
		expect(dataUrlBlob('data:image/png;base64,***')).toBeNull();
	});

	it('places an embedded picture fitted into its box, turned as the SVG turns it', async () => {
		const item = await embeddedPictureItem({ href: 'data:image/png;base64,QUJD', box: { x: 0, y: 0, width: 40, height: 40 }, keepsProportions: true, matrix: [0, 1, -1, 0, 100, 0], visible: false });
		expect(item).toMatchObject({ type: AnnotationObjectTypeId.RasterFragment, pixelWidth: 20, pixelHeight: 10, visible: false });
		expect(item!.rotation).toBeCloseTo(90);
		expect(item!.rect).toEqual({ x: 60, y: 10, width: 40, height: 20 });
		expect(await embeddedPictureItem({ href: 'https://example.com/a.png', box: { x: 0, y: 0, width: 1, height: 1 }, keepsProportions: false, matrix: [1, 0, 0, 1, 0, 0], visible: true })).toBeNull();
		vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('broken'));
		expect(await embeddedPictureItem({ href: 'data:image/png;base64,QUJD', box: { x: 0, y: 0, width: 1, height: 1 }, keepsProportions: false, matrix: [1, 0, 0, 1, 0, 0], visible: true })).toBeNull();
	});

	it('keeps a part no item can be as a picture of that part alone, its layer\'s own fading left to the layer', async () => {
		const { drawn } = drawingPictures();
		const root = new DOMParser().parseFromString(
			'<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><defs><filter id="f"/></defs><rect width="5" height="5"/><g opacity="0.5"><circle r="2"/><rect id="target" width="5" height="5" filter="url(#f)"/></g></svg>',
			'image/svg+xml',
		).documentElement;
		const layer = root.querySelector('g')!;
		const item = await elementPicture(root, root.querySelector('#target')!, { width: 30, height: 20 }, layer);
		expect(item).toMatchObject({ type: AnnotationObjectTypeId.RasterFragment, rect: { x: 0, y: 0, width: 30, height: 20 } });
		const markup = await drawn[0]!.text();
		expect(markup).toContain('<filter id="f"/>');
		expect(markup).toContain('id="target"');
		expect(markup).not.toContain('<circle');
		expect(markup.match(/<rect/g)).toHaveLength(1);
		expect(markup).toContain('opacity: 1; mix-blend-mode: normal');
	});

	it('keeps filtered groups and parts as pictures when an SVG opens, and its first full-size picture as the image', async () => {
		drawingPictures();
		const { document, editableObjects } = await importSvg(
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><image href="data:image/png;base64,QUJD" width="20" height="10"/><g filter="url(#f)"><rect width="5" height="5"/></g><g><use href="#x"/></g></svg>',
			'pictures',
		);
		expect(editableObjects.state.objects.map(({ type }) => type)).toEqual([AnnotationObjectTypeId.RasterFragment, AnnotationObjectTypeId.RasterFragment]);
		expect(editableObjects.state.layers).toHaveLength(2);
		expect(document.pixels.some((value) => value > 0)).toBe(true);
	});
});
