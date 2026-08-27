import { describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { ShapeHandleId, shapeHandles } from '../../core/geometry/shapeTransformHelpers';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';
import { PaintToolId } from '../../core/document/appTypes';

describe('paint mode retained-object handles', () => {
	it('uses resize cursor and transforms the selected stroke while Brush stays active', () => {
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'handle-editing',
			width: 200,
			height: 100,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () => new DOMRect(0, 0, 800, 400);
		const objects = new AnnotationDocument();
		objects.add({
			id: 'stroke',
			type: AnnotationObjectTypeId.Stroke,
			layerId: CoreLayerId.Objects,
			tool: PaintToolId.Brush,
			points: [
				{ x: 40, y: 30, pressure: 1 },
				{ x: 80, y: 60, pressure: 1 },
			],
			sourceRect: { x: 40, y: 30, width: 40, height: 30 },
			rect: { x: 40, y: 30, width: 40, height: 30 },
			color: '#000000',
			size: 4,
			opacity: 1,
			hardness: 1,
			seed: 1,
		});
		new DrawingController(model, undefined, objects);
		const handle = shapeHandles(objects.selected!).southEast;

		pointer(model.overlay, 'pointermove', handle.x, handle.y);
		expect(model.overlay.style.cursor).toBe('nwse-resize');
		pointer(model.overlay, 'pointerdown', handle.x, handle.y);
		pointer(model.overlay, 'pointermove', handle.x + 10, handle.y + 10);
		pointer(model.overlay, 'pointerup', handle.x + 10, handle.y + 10);

		expect(objects.selected).toMatchObject({
			type: AnnotationObjectTypeId.Stroke,
			rect: { width: 50, height: 40 },
		});
		expect(shapeHandles(objects.selected!)[ShapeHandleId.SouthEast]).toEqual({
			x: 90,
			y: 70,
		});
	});
});

function pointer(
	target: HTMLCanvasElement,
	type: string,
	canvasX: number,
	canvasY: number,
): void {
	const bounds = target.getBoundingClientRect();
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			pointerId: 12,
			clientX: bounds.left + (canvasX * bounds.width) / target.width,
			clientY: bounds.top + (canvasY * bounds.height) / target.height,
		}),
	);
}
