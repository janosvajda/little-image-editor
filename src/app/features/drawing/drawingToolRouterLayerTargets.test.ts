import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
} from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { CropSelectionKind } from './cropSelectionTypes';
import { DrawingController } from './drawingController';

const CanvasSize = 80;
const PointerId = 23;

/** jsdom has no Path2D; selection containment comes from the mocked context. */
class TestPath2D {
	moveTo(): void {}
	lineTo(): void {}
	closePath(): void {}
}

function shape(id: string, extra: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 10, y: 10, width: 30, height: 30 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		...extra,
	};
}

describe('drawing tool routing to the active layer', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		vi.stubGlobal('Path2D', TestPath2D);
		model = createDocument();
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, stageViewport(), objects);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('does not paint into a locked active layer', () => {
		objects.createPaintLayer();
		const layer = objects.activeLayer!;
		objects.setLocked(layer.id, true);
		objects.activate(layer.id);
		drawing.select(PaintToolId.Brush);
		drag(20, 20, 40, 40);
		expect(objects.state.objects).toHaveLength(1);
		expect(objects.object(layer.id)).toMatchObject({ points: [] });
	});

	it('does not erase a hidden or empty active layer', () => {
		objects.add(shape('hidden', { visible: false }));
		objects.activate('hidden');
		drawing.select(PaintToolId.Eraser);
		drag(20, 20, 30, 30);
		expect(objects.object('hidden')?.erasures).toBeUndefined();

		const empty = objects.createPaintLayer();
		drag(20, 20, 30, 30);
		expect(objects.object(empty)?.erasures).toBeUndefined();
	});

	it('commits image paint directly when no layer document is attached', () => {
		const imageOnly = new DrawingController(createDocument(), undefined);
		const history = vi.fn();
		imageOnly.documentModel.onHistoryChange(history);
		history.mockClear();
		imageOnly.select(PaintToolId.Brush);
		drag(20, 20, 40, 40, imageOnly.documentModel.overlay);
		expect(history).toHaveBeenCalledWith(true, false);
	});

	it('draws lasso selections point by point over the layers it may cut', () => {
		objects.add(shape('under'));
		objects.add(shape('beside', { rect: { x: 60, y: 60, width: 10, height: 10 } }));
		drawing.select(UtilityToolId.Crop);
		document
			.querySelector<HTMLButtonElement>(`[data-crop-selection-kind="${CropSelectionKind.Lasso}"]`)
			?.click();
		pointer('pointerdown', 12, 12);
		pointer('pointermove', 12, 12);
		pointer('pointermove', 30, 12);
		pointer('pointermove', 30, 30);
		const frame = document.querySelector('.crop-selection-frame')?.getAttribute('d');
		expect(frame).toBe('M12 12L30 12L30 30Z');
		pointer('pointerup', 12, 30);
		expect(
			document.querySelector('.crop-selection-frame')?.getAttribute('d'),
		).toBe('M12 12L30 12L30 30L12 30Z');
	});

	it('shows a move cursor inside an image selection', () => {
		Object.assign(model.context, { isPointInPath: vi.fn(() => true) });
		drawing.select(UtilityToolId.Select);
		drawing.select(UtilityToolId.Crop);
		drag(5, 5, 50, 50);
		pointer('pointermove', 20, 20, 0);
		expect(model.overlay.style.cursor).toBe('move');
		drawing.select(UtilityToolId.Select);
		pointer('pointerdown', 20, 20);
		pointer('pointerup', 20, 20);
		expect(objects.state.objects).toHaveLength(0);
	});

	function drag(
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
		target = model.overlay,
	): void {
		pointer('pointerdown', fromX, fromY, 1, target);
		pointer('pointermove', toX, toY, 1, target);
		pointer('pointerup', toX, toY, 0, target);
	}

	function pointer(
		type: string,
		x: number,
		y: number,
		buttons = type === 'pointerup' ? 0 : 1,
		target = model.overlay,
	): void {
		target.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				button: 0,
				buttons,
				pointerId: PointerId,
				clientX: x,
				clientY: y,
			}),
		);
	}
});

/** Only the stage is needed: it hosts the crop selection overlay. */
function stageViewport(): never {
	return {
		addStageLayer: (layer: Element) => document.body.append(layer),
	} as never;
}

function createDocument(): CanvasDocument {
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	model.create({
		name: 'routing',
		width: CanvasSize,
		height: CanvasSize,
		transparent: false,
		background: '#ffffff',
	});
	model.overlay.getBoundingClientRect = () =>
		new DOMRect(0, 0, CanvasSize, CanvasSize);
	return model;
}
