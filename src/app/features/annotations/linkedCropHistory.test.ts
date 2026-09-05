import { describe, expect, it, vi } from 'vitest';
import { AnnotationDocument, LinkedHistoryDirection } from './annotationDocument';
import { AnnotationObjectTypeId, LinkedHistoryDomain } from './annotationTypes';
import { encodePixelBytes } from '../../shared/image/pixelDataCodec';

describe('linked crop history', () => {
	it('marks raster extraction undo and redo for the paired document history', () => {
		const objects = new AnnotationDocument();
		const linkedAction = vi.fn();
		objects.onLinkedHistoryAction(linkedAction);
		objects.add(
			{
				id: 'fragment',
				type: AnnotationObjectTypeId.RasterFragment,
				rect: { x: 1, y: 2, width: 1, height: 1 },
				pixelWidth: 1,
				pixelHeight: 1,
				pixels: encodePixelBytes(new Uint8ClampedArray([1, 2, 3, 4])),
				rotation: 0,
			},
			true,
			LinkedHistoryDomain.Document,
		);

		objects.undo();
		expect(linkedAction).toHaveBeenLastCalledWith(
			LinkedHistoryDomain.Document,
			LinkedHistoryDirection.Undo,
		);
		objects.redo();
		expect(linkedAction).toHaveBeenLastCalledWith(
			LinkedHistoryDomain.Document,
			LinkedHistoryDirection.Redo,
		);
	});
});
