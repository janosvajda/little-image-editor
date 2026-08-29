import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	PaintToolId,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { CoreLayerId, DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type StrokeAnnotation,
} from '../annotations/annotationTypes';
import { ProjectCodec } from './projectCodec';

const PROJECT_SIZE = 8;
const RGBA_CHANNEL_COUNT = 4;

describe('object erasure project persistence', () => {
	it('round-trips an object-local erasure without creating another object', () => {
		const objects = new AnnotationDocument();
		objects.add(erasedStroke());
		const codec = new ProjectCodec();
		const project = codec.parse(
			codec.serialize(documentSession(), [], objects.snapshotSession()),
		);
		const restored = codec.toEditableObjects(project);

		expect(restored.state.objects).toHaveLength(1);
		expect(restored.state.objects[0]).toMatchObject({
			id: 'stroke',
			erasureRevision: 2,
			erasures: [
				{
					sizeRatio: 0.25,
					opacity: 1,
					hardness: 1,
					strokePointLimit: 2,
				},
			],
		});
	});
});

function erasedStroke(): StrokeAnnotation {
	return {
		id: 'stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 1, y: 1, pressure: 1 },
			{ x: 7, y: 7, pressure: 1 },
		],
		rect: { x: 0, y: 0, width: 8, height: 8 },
		color: '#000000',
		size: 2,
		opacity: 1,
		hardness: 1,
		seed: 1,
		erasureRevision: 2,
		erasures: [
			{
				points: [
					{ xRatio: 0.25, yRatio: 0.25, pressure: 1 },
					{ xRatio: 0.75, yRatio: 0.75, pressure: 1 },
				],
				sizeRatio: 0.25,
				opacity: 1,
				hardness: 1,
				strokePointLimit: 2,
			},
		],
	};
}

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray(
		PROJECT_SIZE * PROJECT_SIZE * RGBA_CHANNEL_COUNT,
	);
	return {
		width: PROJECT_SIZE,
		height: PROJECT_SIZE,
		pixels,
		baseName: 'erased-object',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [{ width: PROJECT_SIZE, height: PROJECT_SIZE, pixels }],
		historyIndex: 0,
		toolbarStates: {},
		layerState: {
			...DEFAULT_LAYER_STATE,
			activeLayerId: CoreLayerId.Objects,
		},
	};
}
