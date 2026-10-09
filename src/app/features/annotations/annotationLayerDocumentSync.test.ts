import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import { AnnotationController } from './annotationController';
import {
	AnnotationObjectTypeId,
	type AnnotationTool,
	AnnotationToolId,
	type ShapeAnnotation,
} from './annotationTypes';

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
	let controller: AnnotationController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector('#canvas')!,
			document.querySelector('#overlay')!,
		);
		model.create({
			name: 'sync',
			width: DocumentSize.Width,
			height: DocumentSize.Height,
			transparent: false,
			background: '#ffffff',
		});
		controller = new AnnotationController(model, {
			addCanvasLayer: (layer: HTMLCanvasElement) => model.overlay.before(layer),
		} as never);
		for (const context of [controller.canvas.getContext('2d')!, model.context])
			for (const method of ['arc', 'fillText', 'strokeRect', 'clip'] as const)
				if (!(method in context)) Object.assign(context, { [method]: vi.fn() });
	});

	it('keeps layers aligned with the image through a crop and its undo', () => {
		controller.annotations.add(shape());
		model.crop({
			x: CropOrigin.x,
			y: CropOrigin.y,
			width: DocumentSize.Width - CropOrigin.x,
			height: DocumentSize.Height - CropOrigin.y,
		});
		expect(controller.annotations.object('layer')?.rect).toMatchObject({
			x: LayerOrigin.x - CropOrigin.x,
			y: LayerOrigin.y - CropOrigin.y,
		});
		model.undo();
		expect(controller.annotations.object('layer')?.rect).toMatchObject({
			x: LayerOrigin.x,
			y: LayerOrigin.y,
		});
	});

	it('lets the image canvas present itself again when the layers are hidden', () => {
		controller.annotations.add(shape({ blendMode: BlendMode.Multiply }));
		expect(model.canvas.style.opacity).toBe('0');
		model.layers.setVisible(CoreLayerId.Objects, false);
		expect(model.canvas.style.opacity).toBe('1');
	});

	it('stops annotation editing while the layers are locked', () => {
		controller.activate();
		expect(controller.active).toBe(true);
		model.layers.setLocked(CoreLayerId.Objects, true);
		expect(controller.active).toBe(false);
		controller.activate();
		expect(controller.active).toBe(false);
	});

	it('restores the last annotation tool from the document toolbar state', () => {
		const preferences = new PersistentDocumentToolbar<{
			tool: AnnotationTool;
			reportEdited: boolean;
		}>(document.createElement('section'), model, 'restored-annotations');
		const restored = new AnnotationController(
			model,
			{ addCanvasLayer: vi.fn() } as never,
			undefined,
			preferences,
		);
		preferences.setExtra({ tool: AnnotationToolId.Box, reportEdited: true });
		model.restoreSession(model.snapshotSession());
		expect(
			restored.panel.toolButtons.get(AnnotationToolId.Box)?.classList,
		).toContain('active');
	});

	it('edits text layers on double-click only while annotating', () => {
		controller.annotations.add(shape());
		const doubleClick = () =>
			model.overlay.dispatchEvent(
				new MouseEvent('dblclick', {
					bubbles: true,
					clientX: LayerOrigin.x + 1,
					clientY: LayerOrigin.y + 1,
				}),
			);
		doubleClick();
		controller.activate();
		doubleClick();
		expect(document.querySelector('.annotation-inline-text')).toBeNull();
	});

	it('keeps a manually edited bug report when the document changes', () => {
		controller.panel.reportPreview.value = 'Manual report';
		controller.panel.reportPreview.dispatchEvent(new Event('input'));
		model.resize(DocumentSize.Width / 2, DocumentSize.Height / 2);
		expect(controller.panel.reportPreview.value).toBe('Manual report');
	});
});
