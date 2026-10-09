import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { LayersController } from './layersController';

const DragPointerId = 9;
const OtherPointerId = 10;
const RowHeight = 30;
const PanelHeight = 300;
const PanelWidth = 200;
const EdgeOffset = 2;

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

describe('layers panel interactions', () => {
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
			name: 'layers',
			width: 40,
			height: 40,
			transparent: true,
			background: '#ffffff',
		});
		objects = new AnnotationDocument();
		controller = new LayersController(model, objects);
		document.body.append(controller.panel.element);
		for (const id of ['bottom', 'middle', 'top']) objects.add(shape(id));
	});

	afterEach(() => {
		document.elementFromPoint = originalElementFromPoint;
	});

	it('reorders a layer by dragging it onto another row', () => {
		stubRowLayout();
		const handle = row('top').querySelector<HTMLButtonElement>('.layer-drag-handle')!;
		pointer(handle, 'pointerdown', 0, 0);
		expect(row('top').classList).toContain('dragging-source');
		expect(document.querySelector('.layer-drag-preview')?.textContent).toBe(
			'Moving Shape 3',
		);
		pointer(handle, 'pointermove', 0, RowHeight * 2 + 1, OtherPointerId);
		expect(document.querySelector('.drag-target')).toBeNull();
		pointer(handle, 'pointermove', 0, RowHeight * 2 + 1);
		expect(row('bottom').classList).toContain('drag-target');
		pointer(handle, 'pointerup', 0, RowHeight * 2 + 1);

		expect(objects.state.objects.map(({ id }) => id)).toEqual([
			'top',
			'bottom',
			'middle',
		]);
		expect(document.querySelector('.layer-drag-preview')).toBeNull();
		expect(document.querySelector('.drag-target')).toBeNull();
	});

	it('scrolls near the panel edges and cancels without reordering', () => {
		stubRowLayout();
		const panel = controller.panel.element;
		panel.getBoundingClientRect = () => new DOMRect(0, 0, PanelWidth, PanelHeight);
		const handle = row('middle').querySelector<HTMLButtonElement>('.layer-drag-handle')!;
		pointer(handle, 'pointerdown', 0, RowHeight);
		pointer(handle, 'pointermove', 0, PanelHeight - EdgeOffset);
		expect(panel.scrollTop).toBeGreaterThanOrEqual(0);
		pointer(handle, 'pointermove', 0, EdgeOffset);
		handle.dispatchEvent(new PointerEvent('pointercancel', { pointerId: DragPointerId }));
		expect(document.querySelector('.layer-drag-preview')).toBeNull();
		expect(objects.state.objects.map(({ id }) => id)).toEqual([
			'bottom',
			'middle',
			'top',
		]);
		pointer(handle, 'pointerup', 0, 0);
		expect(objects.state.objects.map(({ id }) => id)).toEqual([
			'bottom',
			'middle',
			'top',
		]);
	});

	it('finds drop targets by row bounds when hit testing finds no row', () => {
		stubRowLayout(false);
		const handle = row('top').querySelector<HTMLButtonElement>('.layer-drag-handle')!;
		pointer(handle, 'pointerdown', 0, 0);
		pointer(handle, 'pointerup', 0, RowHeight + 1);
		expect(objects.state.objects.map(({ id }) => id)).toEqual([
			'bottom',
			'top',
			'middle',
		]);
	});

	it('controls each layer from its row actions', () => {
		const edit = vi.fn();
		controller.onEditRequested(edit);
		row('middle').querySelector<HTMLButtonElement>('.layer-visibility')!.click();
		expect(objects.object('middle')?.visible).toBe(false);
		row('middle').querySelector<HTMLButtonElement>('.layer-visibility')!.click();
		row('middle').querySelector<HTMLButtonElement>('.layer-backward')!.click();
		expect(objects.state.objects.map(({ id }) => id)).toEqual([
			'middle',
			'bottom',
			'top',
		]);
		row('middle').querySelector<HTMLButtonElement>('.layer-forward')!.click();
		row('middle').querySelector<HTMLButtonElement>('.layer-edit')!.click();
		expect(edit).toHaveBeenCalledWith('middle');
		row('middle').querySelector<HTMLButtonElement>('.layer-delete')!.click();
		expect(objects.object('middle')).toBeNull();
	});

	it('selects rows with the keyboard and the image row through its own actions', () => {
		row('bottom').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(objects.activeLayer?.id).toBe('bottom');
		row('middle').dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		expect(objects.activeLayer?.id).toBe('middle');
		row('middle').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
		expect(objects.activeLayer?.id).toBe('middle');

		const image = imageRow();
		image.click();
		expect(objects.activeLayer).toBeNull();
		expect(imageRow().classList).toContain('active');
		imageRow().querySelector<HTMLButtonElement>('.layer-lock')!.click();
		expect(model.layers.isEditable(CoreLayerId.Image)).toBe(false);
		imageRow().querySelector<HTMLButtonElement>('.layer-visibility')!.click();
		expect(model.layers.isVisible(CoreLayerId.Image)).toBe(false);
		row('top').querySelector<HTMLButtonElement>('.layer-name')!.click();
		imageRow().querySelector<HTMLButtonElement>('.layer-edit')!.click();
		expect(objects.activeLayer).toBeNull();
		row('top').click();
		imageRow().querySelector<HTMLButtonElement>('.layer-name')!.click();
		expect(objects.activeLayer).toBeNull();
	});

	it('commits a typed name with Enter and keeps a slider edit as one step', () => {
		row('top').querySelector<HTMLButtonElement>('.layer-name')!.click();
		const { nameInput, opacityInput } = controller.panel;
		nameInput.value = 'Front';
		nameInput.dispatchEvent(new Event('change'));
		nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(objects.layerName('top')).toBe('Front');
		const steps = objects.snapshotSession().history.length;
		opacityInput.dispatchEvent(new Event('change'));
		expect(objects.snapshotSession().history.length).toBe(steps);
	});

	function row(id: string): HTMLElement {
		return controller.panel.list.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
	}

	function imageRow(): HTMLElement {
		return controller.panel.list.querySelector<HTMLElement>(
			`[data-layer-id="${CoreLayerId.Image}"]`,
		)!;
	}

	/** Lays rows out top to bottom; optionally lets hit testing find them. */
	function stubRowLayout(hitTesting = true): void {
		const rows = [
			...controller.panel.list.querySelectorAll<HTMLElement>('.layer-object-row'),
		];
		rows.forEach((element, index) => {
			element.getBoundingClientRect = () =>
				new DOMRect(0, index * RowHeight, PanelWidth, RowHeight);
		});
		document.elementFromPoint = (_x: number, y: number) =>
			hitTesting ? (rows[Math.floor(y / RowHeight)] ?? null) : null;
	}
});

function pointer(
	target: HTMLElement,
	type: string,
	clientX: number,
	clientY: number,
	pointerId = DragPointerId,
): void {
	target.dispatchEvent(
		new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, clientX, clientY }),
	);
}
