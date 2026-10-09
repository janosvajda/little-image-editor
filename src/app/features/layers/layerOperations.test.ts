import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { compositeLayer, compositeOperation, requiresImageBackdrop } from './layerCompositing';
import { LayerMerger } from './layerMerge';
import { LayersController } from './layersController';

const CanvasSize = 40;
const HALF_OPACITY = 0.5;
const HALF_PERCENT = '50';

function shape(id: string, extra: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 4, y: 4, width: 10, height: 10 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		...extra,
	};
}

describe('layer compositing', () => {
	it('draws default layers directly and isolates blended ones', () => {
		const target = document.createElement('canvas').getContext('2d')!;
		const draw = vi.fn();
		compositeLayer(target, shape('plain'), draw);
		expect(draw).toHaveBeenLastCalledWith(target);

		const composited: Array<readonly [number, string]> = [];
		vi.mocked(target.drawImage).mockImplementation(() => {
			composited.push([target.globalAlpha, target.globalCompositeOperation]);
		});
		target.globalAlpha = 1;
		compositeLayer(
			target,
			shape('blended', { layerOpacity: HALF_OPACITY, blendMode: BlendMode.Multiply }),
			draw,
		);
		expect(draw.mock.lastCall?.[0]).not.toBe(target);
		expect(composited).toEqual([[HALF_OPACITY, BlendMode.Multiply]]);
		expect(target.save).toHaveBeenCalled();
		expect(target.restore).toHaveBeenCalled();
	});

	it('needs the image as a backdrop only for visible blended layers', () => {
		expect(requiresImageBackdrop([shape('plain')])).toBe(false);
		expect(requiresImageBackdrop([shape('faded', { layerOpacity: HALF_OPACITY })])).toBe(false);
		expect(
			requiresImageBackdrop([
				shape('hidden', { blendMode: BlendMode.Screen, visible: false }),
			]),
		).toBe(false);
		expect(requiresImageBackdrop([shape('screen', { blendMode: BlendMode.Screen })])).toBe(true);
		expect(compositeOperation(BlendMode.Normal)).toBe('source-over');
		expect(compositeOperation(BlendMode.Overlay)).toBe('overlay');
	});

	it('hides the image canvas while a composite presents it', () => {
		const model = canvasDocument();
		model.setImagePresentedByComposite(true);
		expect(model.canvas.style.opacity).toBe('0');
		model.setImagePresentedByComposite(false);
		expect(model.canvas.style.opacity).toBe('1');
		model.layers.setVisible(CoreLayerId.Image, false);
		expect(model.canvas.style.opacity).toBe('0');
	});
});

describe('merge down', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let merger: LayerMerger;

	beforeEach(() => {
		model = canvasDocument();
		objects = new AnnotationDocument();
		merger = new LayerMerger(model, objects);
	});

	it('bakes a layer into the layer beneath it, keeping the lower layer identity', () => {
		objects.add(shape('lower', { blendMode: BlendMode.Screen, layerOpacity: HALF_OPACITY }));
		objects.add(shape('upper', { blendMode: BlendMode.Multiply }));
		expect(merger.mergeDown('upper')).toBe(true);
		expect(objects.state.objects).toHaveLength(1);
		expect(objects.state.objects[0]).toMatchObject({
			type: AnnotationObjectTypeId.RasterFragment,
			name: 'Shape 1',
			blendMode: BlendMode.Screen,
			layerOpacity: HALF_OPACITY,
		});
		expect(objects.activeLayer?.id).toBe(objects.state.objects[0]?.id);
		objects.undo();
		expect(objects.state.objects.map(({ id }) => id)).toEqual(['lower', 'upper']);
	});

	it('writes the bottom layer into the image as one linked step', () => {
		objects.add(shape('only'));
		const linked = vi.fn();
		objects.onLinkedHistoryAction(linked);
		const imageHistory = vi.fn();
		model.onHistoryChange(imageHistory);
		imageHistory.mockClear();
		expect(merger.mergeDown('only')).toBe(true);
		expect(objects.state.objects).toHaveLength(0);
		expect(imageHistory).toHaveBeenCalledWith(true, false);
		objects.undo();
		expect(linked).toHaveBeenCalled();
		expect(objects.state.objects).toHaveLength(1);
	});

	it('refuses to merge locked, hidden or missing layers', () => {
		objects.add(shape('lower', { locked: true }));
		objects.add(shape('upper'));
		expect(merger.canMergeDown('upper')).toBe(false);
		expect(merger.mergeDown('upper')).toBe(false);
		expect(merger.canMergeDown('missing')).toBe(false);
		model.layers.setVisible(CoreLayerId.Image, false);
		expect(merger.canMergeDown('lower')).toBe(false);
	});
});

describe('layers panel', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let controller: LayersController;

	beforeEach(() => {
		model = canvasDocument();
		objects = new AnnotationDocument();
		controller = new LayersController(model, objects);
	});

	it('edits the active layer and disables layer actions for the image', () => {
		const { properties, duplicateLayerButton, mergeDownButton } = controller.panel;
		expect(properties.disabled).toBe(true);
		expect(duplicateLayerButton.disabled).toBe(true);
		expect(mergeDownButton.disabled).toBe(true);

		objects.add(shape('a'));
		expect(properties.disabled).toBe(false);
		expect(controller.panel.nameInput.value).toBe('Shape 1');
		expect(mergeDownButton.disabled).toBe(false);

		change(controller.panel.nameInput, 'Sky');
		change(controller.panel.blendModeSelect, BlendMode.Overlay);
		controller.panel.opacityInput.value = HALF_PERCENT;
		controller.panel.opacityInput.dispatchEvent(new Event('input'));
		expect(controller.panel.opacityOutput.value).toBe('50%');
		controller.panel.opacityInput.dispatchEvent(new Event('change'));
		expect(objects.object('a')).toMatchObject({
			name: 'Sky',
			blendMode: BlendMode.Overlay,
			layerOpacity: HALF_OPACITY,
		});
		expect(rowText('a')).toContain('50% · Overlay');
	});

	it('ignores unknown blend modes and restores the name on Escape', () => {
		objects.add(shape('a'));
		const before = structuredClone(objects.object('a'));
		const option = new Option('Invalid', 'not-a-blend-mode');
		controller.panel.blendModeSelect.append(option);
		change(controller.panel.blendModeSelect, 'not-a-blend-mode');
		controller.panel.nameInput.value = 'Unsaved';
		controller.panel.nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(controller.panel.nameInput.value).toBe('Shape 1');
		expect(objects.object('a')).toEqual(before);
	});

	it('duplicates and merges the active layer from the panel actions', () => {
		objects.add(shape('a'));
		controller.panel.duplicateLayerButton.click();
		expect(objects.state.objects).toHaveLength(2);
		controller.panel.mergeDownButton.click();
		expect(objects.state.objects).toHaveLength(1);
	});

	it('activates a row without requesting the edit tool, including hidden layers', () => {
		const edit = vi.fn();
		controller.onEditRequested(edit);
		objects.add(shape('hidden', { visible: false }));
		objects.add(shape('top'));
		row('hidden').querySelector<HTMLButtonElement>('.layer-name')!.click();
		expect(objects.activeLayer?.id).toBe('hidden');
		expect(row('hidden').classList).toContain('active');
		expect(edit).not.toHaveBeenCalled();
	});

	function row(id: string): HTMLElement {
		return controller.panel.list.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
	}

	function rowText(id: string): string {
		return row(id).textContent ?? '';
	}
});

function canvasDocument(): CanvasDocument {
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	model.create({
		name: 'layers',
		width: CanvasSize,
		height: CanvasSize,
		transparent: false,
		background: '#ffffff',
	});
	return model;
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string): void {
	control.value = value;
	control.dispatchEvent(new Event('change'));
}
