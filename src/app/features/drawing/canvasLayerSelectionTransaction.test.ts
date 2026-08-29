import { beforeEach, describe, expect, it } from 'vitest';
import { PaintToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from '../annotations/annotationTypes';
import { LayersController } from '../layers/layersController';
import { DrawingController } from './drawingController';

const CanvasSize = 100;
const OriginalStrokeId = 'original-stroke';
const InteractionPoint = { x: 50, y: 20 } as const;

describe('canvas and Layers selection transaction', () => {
	let model: CanvasDocument;
	let objects: AnnotationDocument;
	let layers: LayersController;

	beforeEach(() => {
		model = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		model.create({
			name: 'selection-transaction',
			width: CanvasSize,
			height: CanvasSize,
			transparent: true,
			background: '#ffffff',
		});
		model.overlay.getBoundingClientRect = () =>
			new DOMRect(0, 0, CanvasSize, CanvasSize);
		objects = new AnnotationDocument();
		objects.add(stroke());
		layers = new LayersController(model, objects);
		new DrawingController(model, undefined, objects);
	});

	it('keeps a click gesture in the active paint layer and aligns Layers selection', () => {
		pointer('pointerdown');
		pointer('pointerup');

		expect(objects.state.objects).toHaveLength(1);
		expect(objects.selectedId).toBe(OriginalStrokeId);
		expect(activeObjectId()).toBe(OriginalStrokeId);

		model.overlay.dispatchEvent(
			new MouseEvent('dblclick', {
				bubbles: true,
				button: 0,
				clientX: InteractionPoint.x,
				clientY: InteractionPoint.y,
			}),
		);

		expect(objects.state.objects.map(({ id }) => id)).toEqual([OriginalStrokeId]);
		expect(objects.selectedId).toBe(OriginalStrokeId);
		expect(activeObjectId()).toBe(OriginalStrokeId);

		layers.panel.list
			.querySelector<HTMLElement>('.layer-object-row.active .layer-delete')
			?.click();
		expect(objects.state.objects).toHaveLength(0);
		expect(objects.selectedId).toBeNull();
	});

	function pointer(type: 'pointerdown' | 'pointerup'): void {
		model.overlay.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				button: 0,
				buttons: type === 'pointerup' ? 0 : 1,
				pointerId: 72,
				clientX: InteractionPoint.x,
				clientY: InteractionPoint.y,
			}),
		);
	}

	function activeObjectId(): string | undefined {
		return layers.panel.list.querySelector<HTMLElement>(
			'.layer-object-row.active',
		)?.dataset.objectId;
	}
});

function stroke(): StrokeAnnotation {
	return {
		id: OriginalStrokeId,
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 20, y: InteractionPoint.y, pressure: 1 },
			{ x: 80, y: InteractionPoint.y, pressure: 1 },
		],
		rect: { x: 18, y: 18, width: 64, height: 4 },
		color: '#000000',
		size: 4,
		opacity: 1,
		hardness: 1,
		seed: 1,
	};
}
