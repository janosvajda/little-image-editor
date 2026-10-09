import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DocumentType,
	PaintToolId,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const CanvasSize = 60;
const PointerId = 17;
const Gesture = { From: 10, To: 30 } as const;

describe('layer-preserving drawing tools', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'layers',
			width: CanvasSize,
			height: CanvasSize,
			transparent: false,
			background: '#ffffff',
			documentType: DocumentType.Image,
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, CanvasSize, CanvasSize);
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, undefined, objects);
	});

	it('paints a flat image into a retained paint layer instead of its pixels', () => {
		const history = vi.fn();
		model.onHistoryChange(history);
		history.mockClear();
		drawing.select(PaintToolId.Brush);
		drag();
		expect(objects.state.objects).toHaveLength(1);
		expect(objects.state.objects[0]?.type).toBe(AnnotationObjectTypeId.Stroke);
		expect(history).not.toHaveBeenCalled();
	});

	it('erases the image layer without flattening or removing retained layers', () => {
		objects.add(stroke());
		objects.select(null);
		const retained = structuredClone(objects.state.objects);
		const history = vi.fn();
		model.onHistoryChange(history);
		history.mockClear();
		drawing.select(PaintToolId.Eraser);
		drag();
		expect(objects.state.objects).toEqual(retained);
		expect(history).toHaveBeenCalledTimes(1);
	});

	it('ignores image erasing while the image layer is locked', () => {
		model.layers.setLocked(CoreLayerId.Image, true);
		const history = vi.fn();
		model.onHistoryChange(history);
		history.mockClear();
		drawing.select(PaintToolId.Eraser);
		drag();
		expect(history).not.toHaveBeenCalled();
	});

	it('notifies tool changes through a typed listener', () => {
		const tools: Tool[] = [];
		drawing.onToolChange((tool) => tools.push(tool));
		drawing.select(UtilityToolId.Crop);
		drawing.select(PaintToolId.Brush);
		expect(tools).toEqual([UtilityToolId.Crop, PaintToolId.Brush]);
	});

	function drag(): void {
		for (const [type, position] of [
			['pointerdown', Gesture.From],
			['pointermove', Gesture.To],
			['pointerup', Gesture.To],
		] as const)
			model.overlay.dispatchEvent(
				new PointerEvent(type, {
					bubbles: true,
					button: 0,
					pointerId: PointerId,
					clientX: position,
					clientY: position,
				}),
			);
	}
});

function stroke(): StrokeAnnotation {
	return {
		id: 'retained',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: Gesture.From, y: Gesture.From, pressure: 1 },
			{ x: Gesture.To, y: Gesture.To, pressure: 1 },
		],
		rect: { x: Gesture.From, y: Gesture.From, width: 20, height: 20 },
		color: '#000000',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
	};
}
