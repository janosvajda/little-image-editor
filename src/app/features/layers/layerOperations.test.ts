import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ContentLayer,
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

function layer(id: string, extra: Partial<ContentLayer> = {}): ContentLayer {
	return { id, name: id, itemIds: [id], ...extra };
}

/** Puts an item in a new layer of its own and returns that layer's id. */
function addLayer(
	objects: AnnotationDocument,
	item: ShapeAnnotation,
	appearance: Parameters<AnnotationDocument['setLayerAppearance']>[1] = {},
): string {
	objects.createLayer();
	objects.add(item);
	const layerId = objects.layerOf(item.id)!.id;
	objects.setLayerAppearance(layerId, appearance);
	return layerId;
}

describe('layer compositing', () => {
	it('draws default layers directly and isolates blended ones', () => {
		const target = document.createElement('canvas').getContext('2d')!;
		const draw = vi.fn();
		compositeLayer(target, layer('plain'), draw);
		expect(draw).toHaveBeenLastCalledWith(target);

		const composited: Array<readonly [number, string]> = [];
		vi.mocked(target.drawImage).mockImplementation(() => {
			composited.push([target.globalAlpha, target.globalCompositeOperation]);
		});
		target.globalAlpha = 1;
		compositeLayer(
			target,
			layer('blended', { opacity: HALF_OPACITY, blendMode: BlendMode.Multiply }),
			draw,
		);
		expect(draw.mock.lastCall?.[0]).not.toBe(target);
		expect(composited).toEqual([[HALF_OPACITY, BlendMode.Multiply]]);
		expect(target.save).toHaveBeenCalled();
		expect(target.restore).toHaveBeenCalled();
	});

	it('needs the image as a backdrop only for visible blended layers', () => {
		expect(requiresImageBackdrop([layer('plain')])).toBe(false);
		expect(requiresImageBackdrop([layer('faded', { opacity: HALF_OPACITY })])).toBe(false);
		expect(
			requiresImageBackdrop([
				layer('hidden', { blendMode: BlendMode.Screen, visible: false }),
			]),
		).toBe(false);
		expect(
			requiresImageBackdrop([layer('empty', { blendMode: BlendMode.Screen, itemIds: [] })]),
		).toBe(false);
		expect(requiresImageBackdrop([layer('screen', { blendMode: BlendMode.Screen })])).toBe(true);
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
		const lower = addLayer(objects, shape('lower'), {
			blendMode: BlendMode.Screen,
			opacity: HALF_OPACITY,
		});
		const upper = addLayer(objects, shape('upper'), { blendMode: BlendMode.Multiply });
		expect(merger.mergeDown(upper)).toBe(true);
		expect(objects.state.layers.map(({ id }) => id)).toEqual([lower]);
		expect(objects.layer(lower)).toMatchObject({
			name: 'Layer 1',
			blendMode: BlendMode.Screen,
			opacity: HALF_OPACITY,
		});
		expect(objects.layerItems(lower).map(({ type }) => type)).toEqual([
			AnnotationObjectTypeId.RasterFragment,
		]);
		expect(objects.activeLayer?.id).toBe(lower);
		objects.undo();
		expect(objects.state.objects.map(({ id }) => id)).toEqual(['lower', 'upper']);
	});

	it('moves items of default layers down unchanged', () => {
		const lower = addLayer(objects, shape('lower'));
		const upper = addLayer(objects, shape('upper'));
		expect(merger.mergeDown(upper)).toBe(true);
		expect(objects.layerItems(lower).map(({ id }) => id)).toEqual(['lower', 'upper']);
	});

	it('writes the bottom layer into the image as one linked step', () => {
		const only = addLayer(objects, shape('only'));
		const linked = vi.fn();
		objects.onLinkedHistoryAction(linked);
		const imageHistory = vi.fn();
		model.onHistoryChange(imageHistory);
		imageHistory.mockClear();
		expect(merger.mergeDown(only)).toBe(true);
		expect(objects.state.objects).toHaveLength(0);
		expect(objects.state.layers).toHaveLength(0);
		expect(imageHistory).toHaveBeenCalledWith(true, false);
		objects.undo();
		expect(linked).toHaveBeenCalled();
		expect(objects.state.objects).toHaveLength(1);
	});

	it('refuses to merge locked, hidden or missing layers', () => {
		const lower = addLayer(objects, shape('lower'));
		const upper = addLayer(objects, shape('upper'));
		objects.setLayerLocked(lower, true);
		expect(merger.canMergeDown(upper)).toBe(false);
		expect(merger.mergeDown(upper)).toBe(false);
		expect(merger.canMergeDown('missing')).toBe(false);
		objects.setLayerLocked(lower, false);
		model.layers.setVisible(CoreLayerId.Image, false);
		expect(merger.canMergeDown(lower)).toBe(false);
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
		const id = objects.layerOf('a')!.id;
		expect(properties.disabled).toBe(false);
		expect(controller.panel.nameInput.value).toBe('Layer 1');
		expect(mergeDownButton.disabled).toBe(false);

		change(controller.panel.nameInput, 'Sky');
		change(controller.panel.blendModeSelect, BlendMode.Overlay);
		controller.panel.opacityInput.value = HALF_PERCENT;
		controller.panel.opacityInput.dispatchEvent(new Event('input'));
		expect(controller.panel.opacityOutput.value).toBe('50%');
		controller.panel.opacityInput.dispatchEvent(new Event('change'));
		expect(objects.layer(id)).toMatchObject({
			name: 'Sky',
			blendMode: BlendMode.Overlay,
			opacity: HALF_OPACITY,
		});
		expect(rowText(id)).toContain('50% · Overlay');
	});

	it('ignores unknown blend modes and restores the name on Escape', () => {
		objects.add(shape('a'));
		const id = objects.layerOf('a')!.id;
		const before = structuredClone(objects.layer(id));
		const option = new Option('Invalid', 'not-a-blend-mode');
		controller.panel.blendModeSelect.append(option);
		change(controller.panel.blendModeSelect, 'not-a-blend-mode');
		controller.panel.nameInput.value = 'Unsaved';
		controller.panel.nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(controller.panel.nameInput.value).toBe('Layer 1');
		expect(objects.layer(id)).toEqual(before);
	});

	it('duplicates and merges the active layer from the panel actions', () => {
		objects.add(shape('a'));
		controller.panel.duplicateLayerButton.click();
		expect(objects.state.layers).toHaveLength(2);
		expect(objects.state.objects).toHaveLength(2);
		controller.panel.mergeDownButton.click();
		expect(objects.state.layers).toHaveLength(1);
		expect(objects.state.objects).toHaveLength(2);
	});

	it('activates a hidden layer row without requesting the edit tool', () => {
		const edit = vi.fn();
		controller.onEditRequested(edit);
		const hidden = addLayer(objects, shape('hidden'));
		objects.setLayerVisible(hidden, false);
		addLayer(objects, shape('top'));
		row(hidden).querySelector<HTMLButtonElement>('.layer-name')!.click();
		expect(objects.activeLayer?.id).toBe(hidden);
		expect(row(hidden).classList).toContain('active');
		expect(edit).not.toHaveBeenCalled();
	});

	function row(id: string): HTMLElement {
		return controller.panel.list.querySelector<HTMLElement>(
			`[data-content-layer-id="${id}"]`,
		)!;
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
