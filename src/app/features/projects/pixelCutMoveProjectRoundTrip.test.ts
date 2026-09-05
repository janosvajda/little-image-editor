import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	ShapeToolId,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { CoreLayerId, DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { ProjectCodec } from './projectCodec';

const DOCUMENT_SIZE = 16;
const CHANNELS_PER_PIXEL = 4;

describe('pixel cut-and-move project persistence', () => {
	it('round-trips retained source and fragment masks exactly', () => {
		const objects = new AnnotationDocument();
		objects.add({
			id: 'shape',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 2, y: 2, width: 10, height: 10 },
			color: '#123456',
			width: 2,
			opacity: 1,
			fill: true,
		});
		objects.cutAndMove(
			'shape',
			[
				{ x: 2, y: 2 },
				{ x: 7, y: 2 },
				{ x: 5, y: 8 },
			],
			{ x: 4, y: 3 },
		);
		const before = objects.snapshotSession();
		const codec = new ProjectCodec();
		const restored = codec.toEditableObjects(
			codec.parse(codec.serialize(documentSession(), [], before)),
		);

		expect(restored).toEqual(before);
	});
});

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray(
		DOCUMENT_SIZE * DOCUMENT_SIZE * CHANNELS_PER_PIXEL,
	);
	return {
		width: DOCUMENT_SIZE,
		height: DOCUMENT_SIZE,
		pixels,
		baseName: 'pixel-cut-move',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [{ width: DOCUMENT_SIZE, height: DOCUMENT_SIZE, pixels }],
		historyIndex: 0,
		toolbarStates: {},
		layerState: { ...DEFAULT_LAYER_STATE, activeLayerId: CoreLayerId.Objects },
	};
}
