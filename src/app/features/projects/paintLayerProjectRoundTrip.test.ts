import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	PaintToolId,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { createEmptyStroke } from '../annotations/paintLayerFactory';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { ProjectCodec } from './projectCodec';

const Canvas = { Width: 20, Height: 10, Channels: 4 } as const;

describe('paint layer project round trip', () => {
	it('preserves multiple styled paths as one editable .limg layer', () => {
		const objects = new AnnotationDocument();
		const layer = createEmptyStroke();
		layer.points = [
			{ x: 1, y: 1, pressure: 1 },
			{ x: 5, y: 5, pressure: 1 },
			{ x: 10, y: 2, pressure: 1 },
			{ x: 15, y: 7, pressure: 0.5 },
		];
		layer.pathStarts = [2];
		layer.pathStyles = [
			{
				startIndex: 0,
				tool: PaintToolId.Brush,
				color: '#112233',
				size: 4,
				opacity: 1,
				hardness: 0.8,
				seed: 1,
			},
			{
				startIndex: 2,
				tool: PaintToolId.Marker,
				color: '#aabbcc',
				size: 9,
				opacity: 0.6,
				hardness: 1,
				seed: 2,
			},
		];
		layer.rect = { x: 0, y: 0, width: 18, height: 10 };
		layer.sourceRect = { ...layer.rect };
		objects.add(layer);

		const codec = new ProjectCodec();
		const project = codec.parse(
			codec.serialize(documentSession(), [], objects.snapshotSession()),
		);
		const restored = new AnnotationDocument();
		restored.restoreSession(codec.toEditableObjects(project));

		expect(restored.state.objects).toHaveLength(1);
		expect(restored.state.layers).toEqual(objects.state.layers);
		expect(restored.state.objects[0]).toMatchObject({
			type: AnnotationObjectTypeId.Stroke,
			pathStarts: [2],
			pathStyles: layer.pathStyles,
			points: layer.points,
		});
	});
});

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray(
		Canvas.Width * Canvas.Height * Canvas.Channels,
	);
	return {
		width: Canvas.Width,
		height: Canvas.Height,
		pixels,
		baseName: 'paint-layer',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [{ width: Canvas.Width, height: Canvas.Height, pixels }],
		historyIndex: 0,
		toolbarStates: {},
		layerState: DEFAULT_LAYER_STATE,
	};
}
