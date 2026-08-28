import { describe, expect, it } from 'vitest';
import { PaintToolId, ShapeToolId, UtilityToolId } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { genericShape } from '../../core/geometry/genericShape';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { DrawingController } from './drawingController';

const Canvas = { Width: 200, Height: 140 } as const;
const Shape = { X: 20, Y: 50, Width: 40, Height: 30 } as const;
const Drag = { X: 12, Y: 8 } as const;

describe('explicit retained-object movement', () => {
	it('keeps painting over a selection and moves it only from its handle outside Select mode', () => {
		const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
		const model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			overlay,
		);
		model.create({
			name: 'move-handle',
			width: Canvas.Width,
			height: Canvas.Height,
			transparent: false,
			background: ColorPalette.White,
		});
		overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, Canvas.Width, Canvas.Height);
		const objects = new AnnotationDocument();
		objects.add({
			id: 'shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: {
				x: Shape.X,
				y: Shape.Y,
				width: Shape.Width,
				height: Shape.Height,
			},
			rotation: 0,
			color: ColorPalette.Black,
			width: 2,
			opacity: 1,
			fill: false,
		});
		const controller = new DrawingController(model, undefined, objects);

		drag(overlay, { x: 30, y: 60 }, { x: 45, y: 65 });
		expect(objects.object('shape')?.rect).toMatchObject({ x: Shape.X, y: Shape.Y });
		expect(objects.state.objects).toHaveLength(2);
		expect(objects.state.objects.at(-1)).toMatchObject({
			type: AnnotationObjectTypeId.Stroke,
			tool: PaintToolId.Brush,
		});

		objects.select('shape');
		const moveHandle = genericShape(objects.selected!).moveHandle();
		drag(overlay, moveHandle, {
			x: moveHandle.x + Drag.X,
			y: moveHandle.y + Drag.Y,
		});
		expect(objects.object('shape')?.rect).toMatchObject({
			x: Shape.X + Drag.X,
			y: Shape.Y + Drag.Y,
		});

		controller.select(UtilityToolId.Select);
		drag(overlay, { x: 40, y: 70 }, { x: 45, y: 75 });
		expect(objects.object('shape')?.rect).toMatchObject({
			x: Shape.X + Drag.X + 5,
			y: Shape.Y + Drag.Y + 5,
		});
	});
});

function drag(
	target: HTMLCanvasElement,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): void {
	for (const [type, point, buttons] of [
		['pointerdown', from, 1],
		['pointermove', to, 1],
		['pointerup', to, 0],
	] as const)
		target.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				cancelable: true,
				button: 0,
				buttons,
				pointerId: 41,
				clientX: point.x,
				clientY: point.y,
			}),
		);
}
