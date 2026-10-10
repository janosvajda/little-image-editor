import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShapeToolId, UtilityToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { DrawingController } from '../drawing/drawingController';
import { LayersController } from './layersController';

const PointerId = 31;
const ListBox = { top: 0, height: 100 } as const;
const RowHeight = 30;
/** Places a row below the visible part of the list. */
const HiddenRowTop = 150;

function shape(id: string): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 4, y: 4, width: 10, height: 10 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
	};
}

describe('layer list item rows', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let controller: LayersController;
	const originalElementFromPoint = document.elementFromPoint;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'items',
			width: 40,
			height: 40,
			transparent: true,
			background: '#ffffff',
		});
		objects = new AnnotationDocument();
		objects.restore({
			objects: ['a1', 'a2', 'b1'].map(shape),
			layers: [
				{ id: 'a', name: 'Layer 1', itemIds: ['a1', 'a2'] },
				{ id: 'b', name: 'Layer 2', itemIds: ['b1'] },
			],
			nextStep: 1,
		});
		controller = new LayersController(model, objects);
		document.body.append(controller.panel.element);
	});

	afterEach(() => {
		document.elementFromPoint = originalElementFromPoint;
	});

	it('only activates the layer of a locked item chosen in the list', () => {
		objects.setLocked('a1', true);
		itemRow('a1').querySelector<HTMLButtonElement>('.layer-name')!.click();
		expect(objects.selectedId).toBeNull();
		expect(objects.activeLayer?.id).toBe('a');
		expect(model.layers.state.activeLayerId).toBe(CoreLayerId.Objects);
	});

	it('drops items onto items and layers, and layers onto an item of another layer', () => {
		dragOnto(itemRow('b1'), itemRow('a1'));
		expect(objects.layerOf('b1')?.id).toBe('a');

		dragOnto(itemRow('a2'), layerRow('b'));
		expect(objects.layerItems('b').map(({ id }) => id)).toEqual(['a2']);

		dragOnto(layerRow('b'), itemRow('a1'));
		expect(objects.state.layers.map(({ id }) => id)).toEqual(['b', 'a']);
	});

	it('locks a layer from its row and hides or shows its items with the chevron', () => {
		layerRow('a').querySelector<HTMLButtonElement>('.layer-lock')!.click();
		expect(objects.layer('a')?.locked).toBe(true);
		layerRow('a').querySelector<HTMLButtonElement>('.layer-lock')!.click();
		expect(objects.layer('a')?.locked).toBe(false);

		layerRow('a').querySelector<HTMLButtonElement>('.layer-expand')!.click();
		expect(controller.panel.list.querySelector('[data-object-id="a1"]')).toBeNull();
		layerRow('a').querySelector<HTMLButtonElement>('.layer-expand')!.click();
		expect(itemRow('a1')).not.toBeNull();
	});

	it('does nothing when a drag handle is merely clicked', () => {
		const before = structuredClone(objects.state);
		layerRow('a').querySelector<HTMLButtonElement>('.layer-drag-handle')!.click();
		expect(objects.state).toEqual(before);
	});

	it('scrolls a newly selected item into view', () => {
		const list = controller.panel.list;
		list.getBoundingClientRect = () =>
			new DOMRect(0, ListBox.top, 100, ListBox.height);
		const original = HTMLElement.prototype.getBoundingClientRect;
		HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
			return this.classList.contains('layer-item-row')
				? new DOMRect(0, HiddenRowTop, 100, RowHeight)
				: original.call(this);
		};
		try {
			objects.select('a1');
			expect(list.scrollTop).toBe(HiddenRowTop + RowHeight - ListBox.height);
		} finally {
			HTMLElement.prototype.getBoundingClientRect = original;
		}
	});

	it('edits a whole layer with the Select tool on request', () => {
		const drawing = new DrawingController(model, undefined, objects);
		controller.onEditRequested((layerId) => drawing.editLayer(layerId));
		layerRow('b').querySelector<HTMLButtonElement>('.layer-edit')!.click();
		expect(drawing.tool).toBe(UtilityToolId.Select);
		expect(objects.selectedLayer?.id).toBe('b');
		objects.setLayerLocked('a', true);
		drawing.editLayer('a');
		expect(objects.selectedLayer?.id).toBe('b');
	});

	function itemRow(id: string): HTMLElement {
		return controller.panel.list.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
	}

	function layerRow(id: string): HTMLElement {
		return controller.panel.list.querySelector<HTMLElement>(
			`[data-content-layer-id="${id}"]`,
		)!;
	}

	function dragOnto(source: HTMLElement, target: HTMLElement): void {
		document.elementFromPoint = () => target;
		const handle = source.querySelector<HTMLButtonElement>('.layer-drag-handle')!;
		for (const type of ['pointerdown', 'pointerup'])
			handle.dispatchEvent(
				new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: PointerId }),
			);
	}
});
