import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId, UtilityToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import { DrawingController } from '../drawing/drawingController';
import { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import { AnnotationDocument } from './annotationDocument';
import { ANNOTATION_TOOLBAR_KEY, AnnotationPanel } from './annotationPanel';
import { AnnotationObjectTypeId, type ShapeAnnotation } from './annotationTypes';
import { BugReportController, type BugReportPreferences } from './bugReportController';
import { ContentLayerCanvas } from './contentLayerCanvas';

const DocumentSize = { Width: 200, Height: 100 } as const;
const CropOrigin = { x: 30, y: 20 } as const;
const LayerOrigin = { x: 50, y: 40 } as const;

function shape(extra: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id: 'layer',
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: LayerOrigin.x, y: LayerOrigin.y, width: 20, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		...extra,
	};
}

describe('annotation layers follow the image document', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let layerCanvas: ContentLayerCanvas;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector('#canvas')!,
			document.querySelector('#overlay')!,
		);
		objects = new AnnotationDocument();
		layerCanvas = new ContentLayerCanvas(
			model,
			{ addCanvasLayer: (layer: HTMLCanvasElement) => model.overlay.before(layer) },
			objects,
			vi.fn(),
		);
		model.create({
			name: 'sync',
			width: DocumentSize.Width,
			height: DocumentSize.Height,
			transparent: false,
			background: '#ffffff',
		});
		for (const context of [layerCanvas.canvas.getContext('2d')!, model.context])
			for (const method of ['arc', 'fillText', 'strokeRect', 'clip'] as const)
				if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
	});

	it('keeps layers aligned with the image through a crop and its undo', () => {
		objects.add(shape());
		model.crop({
			x: CropOrigin.x,
			y: CropOrigin.y,
			width: DocumentSize.Width - CropOrigin.x,
			height: DocumentSize.Height - CropOrigin.y,
		});
		expect(objects.object('layer')?.rect).toMatchObject({
			x: LayerOrigin.x - CropOrigin.x,
			y: LayerOrigin.y - CropOrigin.y,
		});
		model.undo();
		expect(objects.object('layer')?.rect).toMatchObject({
			x: LayerOrigin.x,
			y: LayerOrigin.y,
		});
	});

	it('lets the image canvas present itself again when the layers are hidden', () => {
		objects.add(shape());
		objects.setLayerAppearance(objects.layerOf('layer')!.id, {
			blendMode: BlendMode.Multiply,
		});
		expect(model.canvas.style.opacity).toBe('0');
		model.layers.setVisible(CoreLayerId.Objects, false);
		expect(model.canvas.style.opacity).toBe('1');
	});

	it('adds no items while the layers are locked', () => {
		const drawing = new DrawingController(model, undefined, objects);
		model.layers.setLocked(CoreLayerId.Objects, true);
		drawing.select(ShapeToolId.Rectangle);
		drag(model.overlay, { x: 10, y: 10 }, { x: 60, y: 40 });
		expect(objects.state.objects).toHaveLength(0);
	});

	it('restores the tool in use with the document session and shows it in the capture toolbar', () => {
		const drawing = new DrawingController(model, undefined, objects);
		const panel = new AnnotationPanel((tool) => drawing.select(tool));
		drawing.onToolChange((tool) => panel.showActiveTool(tool));
		drawing.select(ShapeToolId.Rectangle);
		const session = model.snapshotSession();
		drawing.select(UtilityToolId.Select);
		model.restoreSession(session);
		expect(drawing.tool).toBe(ShapeToolId.Rectangle);
		expect(panel.tools.querySelector('.active')?.getAttribute('data-tool')).toBe(
			ShapeToolId.Rectangle,
		);
	});

	it('opens no text editor when a non-text item is double-clicked', () => {
		const drawing = new DrawingController(model, undefined, objects);
		objects.add(shape());
		drawing.select(UtilityToolId.Select);
		model.overlay.dispatchEvent(
			new MouseEvent('dblclick', {
				bubbles: true,
				clientX: LayerOrigin.x + 1,
				clientY: LayerOrigin.y + 1,
			}),
		);
		expect(document.querySelector('.annotation-inline-text')).toBeNull();
	});

	it('keeps a manually edited bug report when the document changes', () => {
		const panel = new AnnotationPanel(vi.fn());
		document.body.append(panel.element);
		new BugReportController(
			model,
			panel,
			new PersistentDocumentToolbar<BugReportPreferences>(
				panel.element,
				model,
				ANNOTATION_TOOLBAR_KEY,
			),
		);
		panel.reportPreview.value = 'Manual report';
		panel.reportPreview.dispatchEvent(new Event('input'));
		model.resize(DocumentSize.Width / 2, DocumentSize.Height / 2);
		expect(panel.reportPreview.value).toBe('Manual report');
	});
});

function drag(
	overlay: HTMLCanvasElement,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): void {
	overlay.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			right: DocumentSize.Width,
			bottom: DocumentSize.Height,
			x: 0,
			y: 0,
			width: DocumentSize.Width,
			height: DocumentSize.Height,
		}) as DOMRect;
	for (const [type, point] of [
		['pointerdown', from],
		['pointermove', to],
		['pointerup', to],
	] as const)
		overlay.dispatchEvent(
			new MouseEvent(type, {
				bubbles: true,
				cancelable: true,
				button: 0,
				clientX: point.x,
				clientY: point.y,
			}),
		);
}
