import { beforeEach, describe, expect, it } from 'vitest';
import { UtilityToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { DrawingController } from '../drawing/drawingController';
import { RasterSelection } from './rasterSelection';

describe('raster selection isolation', () => {
	let documentModel: CanvasDocument;
	let editableObjects: AnnotationDocument;
	let selection: RasterSelection;
	let drawing: DrawingController;

	beforeEach(() => {
		documentModel = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		documentModel.create({
			name: 'raster-selection',
			width: 100,
			height: 80,
			transparent: false,
			background: '#ffffff',
		});
		documentModel.overlay.getBoundingClientRect = () =>
			({ left: 0, top: 0, width: 100, height: 80 }) as DOMRect;
		editableObjects = new AnnotationDocument();
		selection = new RasterSelection(documentModel);
		drawing = new DrawingController(
			documentModel,
			undefined,
			editableObjects,
			selection,
		);
	});

	it('creates a transient rectangle on empty raster pixels without adding a layer object', () => {
		drawing.select(UtilityToolId.Select);
		pointer('pointerdown', 12, 18);
		pointer('pointermove', 62, 58);
		pointer('pointerup', 62, 58);

		expect(selection.value).toEqual({ x: 12, y: 18, width: 50, height: 40 });
		expect(editableObjects.state.objects).toHaveLength(0);
	});

	it('clears the transient rectangle when a non-selection drawing tool activates', () => {
		selection.begin({ x: 5, y: 6 });
		selection.finish({ x: 20, y: 30 });

		drawing.selectFromShortcut('b');

		expect(selection.value).toBeNull();
	});

	it('does not serialize raster selection into the document session', () => {
		selection.begin({ x: 5, y: 6 });
		selection.finish({ x: 20, y: 30 });

		const session = documentModel.snapshotSession();

		expect(session).not.toHaveProperty('rasterSelection');
		expect(session.layerState.layers).toHaveLength(2);
	});

	function pointer(type: string, x: number, y: number): void {
		documentModel.overlay.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				cancelable: true,
				button: 0,
				pointerId: 1,
				clientX: x,
				clientY: y,
			}),
		);
	}
});
