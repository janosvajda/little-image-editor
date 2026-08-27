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

const CanvasFixture = {
	Size: 64,
	Channels: 4,
} as const;

describe('retained stroke project contract', () => {
	it('keeps a brush stroke editable across move, resize, save, and reopen', () => {
		const objects = new AnnotationDocument();
		objects.add(stroke());
		objects.move('brush-stroke', { x: 5, y: 7 });
		objects.resizeSelected({ x: 50, y: 40 });
		const beforeSave = objects.snapshotSession();
		const codec = new ProjectCodec();
		const project = codec.parse(
			codec.serialize(documentSession(), [], beforeSave),
		);
		const restored = new AnnotationDocument();
		restored.restoreSession(codec.toEditableObjects(project));

		expect(restored.snapshotSession()).toEqual(beforeSave);
		expect(restored.object('brush-stroke')).toMatchObject({
			type: AnnotationObjectTypeId.Stroke,
			tool: PaintToolId.Brush,
			color: '#cc2244',
		});
		restored.select('brush-stroke');
		restored.move('brush-stroke', { x: 1, y: 1 });
		expect(restored.selected?.id).toBe('brush-stroke');
	});
});

function stroke(): StrokeAnnotation {
	return {
		id: 'brush-stroke',
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 10, y: 12, pressure: 1 },
			{ x: 25, y: 28, pressure: 0.7 },
		],
		rect: { x: 7, y: 9, width: 21, height: 22 },
		color: '#cc2244',
		size: 6,
		opacity: 0.8,
		hardness: 0.75,
		seed: 42,
	};
}

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray(
		CanvasFixture.Size * CanvasFixture.Size * CanvasFixture.Channels,
	);
	return {
		width: CanvasFixture.Size,
		height: CanvasFixture.Size,
		pixels,
		baseName: 'retained-stroke',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [
			{ width: CanvasFixture.Size, height: CanvasFixture.Size, pixels },
		],
		historyIndex: 0,
		toolbarStates: {},
		layerState: {
			...DEFAULT_LAYER_STATE,
			activeLayerId: CoreLayerId.Objects,
		},
	};
}
