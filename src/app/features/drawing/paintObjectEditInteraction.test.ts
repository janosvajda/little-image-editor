import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const CanvasSize = { Width: 200, Height: 100 } as const;
const Stroke = {
	Id: 'editable-stroke',
	Start: { x: 20, y: 30 },
	End: { x: 80, y: 30 },
	EditedEnd: { x: 120, y: 50 },
} as const;

describe('paint object edit interaction', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let drawing: DrawingController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'paint-edit',
			width: CanvasSize.Width,
			height: CanvasSize.Height,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () => canvasBounds();
		objects = new AnnotationDocument();
		drawing = new DrawingController(model, undefined, objects);
		objects.add(strokeObject());
	});

	it('continues the same stroke after the Layers Edit action', () => {
		drawing.editObject(Stroke.Id);
		continueFromEndpoint();

		expectEditedStroke();
	});

	it('continues the same stroke after double-clicking the paint object', () => {
		pointer('dblclick', 50, Stroke.Start.y);
		continueFromEndpoint();

		expectEditedStroke();
	});

	function continueFromEndpoint(): void {
		pointer('pointerdown', Stroke.End.x, Stroke.End.y);
		pointer('pointermove', Stroke.EditedEnd.x, Stroke.EditedEnd.y);
		pointer('pointerup', Stroke.EditedEnd.x, Stroke.EditedEnd.y);
	}

	function expectEditedStroke(): void {
		const edited = objects.object(Stroke.Id);
		expect(objects.state.objects).toHaveLength(1);
		expect(edited?.type).toBe(AnnotationObjectTypeId.Stroke);
		if (edited?.type === AnnotationObjectTypeId.Stroke)
			expect(edited.points.at(-1)).toMatchObject(Stroke.EditedEnd);
	}

	function pointer(type: string, x: number, y: number): void {
		model.overlay.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				button: 0,
				buttons: type === 'pointerup' ? 0 : 1,
				clientX: x,
				clientY: y,
				pointerId: 31,
			}),
		);
	}
});

function strokeObject(): StrokeAnnotation {
	return {
		id: Stroke.Id,
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ ...Stroke.Start, pressure: 1 },
			{ ...Stroke.End, pressure: 1 },
		],
		sourceRect: { x: 18, y: 28, width: 64, height: 4 },
		rect: { x: 18, y: 28, width: 64, height: 4 },
		color: '#000000',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
		rotation: 0,
	};
}

function canvasBounds(): DOMRect {
	return {
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: CanvasSize.Width,
		bottom: CanvasSize.Height,
		width: CanvasSize.Width,
		height: CanvasSize.Height,
		toJSON: () => ({}),
	};
}
