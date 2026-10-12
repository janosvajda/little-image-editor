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
import { SVG_PICKER_TYPE } from './openFileTypes';
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
		expect(picker).toHaveBeenCalledWith({ suggestedName: 'fresh.svg', types: [SVG_PICKER_TYPE] });
		expect(svg.written).toHaveLength(1);
		expect([model.fileHandle, model.documentType]).toEqual([svg.file, DocumentType.Svg]);
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

	it('keeps an image opened from a file as that file, so Save writes back into it', async () => {
		const { model, files } = editor();
		const png = target('photo.png');
		await files.openFile(new File(['png'], 'photo.png', { type: 'image/png' }), png.file);
		expect(model.fileHandle).toBe(png.file);
	});

});

describe('arrows and layers in an SVG', () => {
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
