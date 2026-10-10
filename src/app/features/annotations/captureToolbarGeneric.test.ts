import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MarkupToolId,
	ShapeToolId,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { DrawingController } from '../drawing/drawingController';
import { DRAWING_TOOL_DEFINITIONS } from '../drawing/drawingToolCatalog';
import { LayerMerger } from '../layers/layerMerge';
import { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import { AnnotationDocument } from './annotationDocument';
import { ANNOTATION_TOOLBAR_KEY, AnnotationPanel, CAPTURE_TOOLS } from './annotationPanel';
import { AnnotationObjectTypeId, type ShapeAnnotation } from './annotationTypes';
import { BugReportController, type BugReportPreferences } from './bugReportController';
import { ContentLayerCanvas } from './contentLayerCanvas';

const Surface = { width: 120, height: 80 } as const;
const LAYER_STATE_KEY = 'annotations';

function shape(id: string): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 10, y: 10, width: 30, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		rotation: 0,
	};
}

let model: CanvasDocument;
let objects: AnnotationDocument;

beforeEach(() => {
	model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	objects = new AnnotationDocument();
});

describe('the Capture & annotate toolbar is a view of the shared tools', () => {
	it('offers only shared tools, picks them, and shows the tool in use', () => {
		const chosen: Tool[] = [];
		const panel = new AnnotationPanel((tool) => chosen.push(tool));
		const buttons = [...panel.tools.querySelectorAll<HTMLButtonElement>('[data-tool]')];
		expect(buttons.map((button) => button.dataset.tool)).toEqual(CAPTURE_TOOLS);
		for (const tool of CAPTURE_TOOLS)
			expect(DRAWING_TOOL_DEFINITIONS.some((definition) => definition.id === tool)).toBe(true);

		panel.tools.querySelector<HTMLButtonElement>(`[data-tool="${MarkupToolId.Blur}"]`)!.click();
		expect(chosen).toEqual([MarkupToolId.Blur]);
		panel.showActiveTool(ShapeToolId.Arrow);
		expect(panel.tools.querySelector('.active')?.getAttribute('data-tool')).toBe(ShapeToolId.Arrow);
	});

	it('drives the same tool as the Tools panel', () => {
		model.create({ name: 'capture', ...Surface, transparent: false, background: '#ffffff' });
		const drawing = new DrawingController(model, undefined, objects);
		const panel = new AnnotationPanel((tool) => drawing.select(tool));
		drawing.onToolChange((tool) => panel.showActiveTool(tool));
		panel.tools.querySelector<HTMLButtonElement>(`[data-tool="${MarkupToolId.Highlight}"]`)!.click();
		expect(drawing.tool).toBe(MarkupToolId.Highlight);
		drawing.select(UtilityToolId.Select);
		expect(panel.tools.querySelector('.active')?.getAttribute('data-tool')).toBe(UtilityToolId.Select);
	});
});

describe('the shared layer canvas', () => {
	it('keeps the layers with the document and restores them with it', () => {
		const viewport = { addCanvasLayer: vi.fn() };
		new ContentLayerCanvas(model, viewport, objects, vi.fn());
		model.create({ name: 'layers', ...Surface, transparent: false, background: '#ffffff' });
		objects.add(shape('kept'));
		const saved = model.toolbarState<{ state: { objects: unknown[] } }>(LAYER_STATE_KEY);
		expect(saved?.state.objects).toHaveLength(1);
		expect(viewport.addCanvasLayer).toHaveBeenCalledOnce();
	});

	it('bakes the layers into the image before the image is resized', () => {
		const flatten = vi.fn();
		new ContentLayerCanvas(model, { addCanvasLayer: vi.fn() }, objects, flatten);
		model.create({ name: 'resize', ...Surface, transparent: false, background: '#ffffff' });
		model.resize(Surface.width * 2, Surface.height * 2);
		expect(flatten).toHaveBeenCalled();
	});
});

describe('flattening layers into the image', () => {
	it('is one undoable step that brings the layers back', () => {
		model.create({ name: 'flatten', ...Surface, transparent: false, background: '#ffffff' });
		objects.add(shape('baked'));
		objects.onLinkedHistoryAction(() => model.undo());
		const merger = new LayerMerger(model, objects);
		expect(merger.canFlatten()).toBe(true);
		expect(merger.flatten()).toBe(true);
		expect(objects.state.objects).toHaveLength(0);
		objects.undo();
		expect(objects.state.objects.map((item) => item.id)).toEqual(['baked']);
	});

	it('is unavailable without layers or with the image locked', () => {
		model.create({ name: 'locked', ...Surface, transparent: false, background: '#ffffff' });
		const merger = new LayerMerger(model, objects);
		expect(merger.canFlatten()).toBe(false);
		objects.add(shape('present'));
		model.layers.setLocked(CoreLayerId.Image, true);
		expect(merger.flatten()).toBe(false);
	});
});

describe('the capture bug report', () => {
	it('regenerates from the report fields, keeping a hand edit until a field changes', () => {
		const panel = new AnnotationPanel(vi.fn());
		document.body.append(panel.element);
		const preferences = new PersistentDocumentToolbar<BugReportPreferences>(
			panel.element,
			model,
			ANNOTATION_TOOLBAR_KEY,
		);
		new BugReportController(model, panel, preferences);
		model.create({ name: 'report', ...Surface, transparent: false, background: '#ffffff' });
		panel.expected.value = 'Saves the file';
		panel.expected.dispatchEvent(new Event('input'));
		expect(panel.reportPreview.value).toContain('Saves the file');

		panel.reportPreview.value = 'Written by hand';
		panel.reportPreview.dispatchEvent(new Event('input'));
		expect(preferences.extra).toEqual({ reportEdited: true });
		model.resize(Surface.width + 1, Surface.height);
		expect(panel.reportPreview.value).toBe('Written by hand');
		panel.actual.value = 'Crashes';
		panel.actual.dispatchEvent(new Event('input'));
		expect(panel.reportPreview.value).toContain('Crashes');
	});
});
