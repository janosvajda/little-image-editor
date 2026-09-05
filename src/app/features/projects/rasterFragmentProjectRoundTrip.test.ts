import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationSessionState,
} from '../annotations/annotationTypes';
import { encodePixelBytes } from '../../shared/image/pixelDataCodec';
import { ProjectCodec } from './projectCodec';

const DOCUMENT_SIZE = 8;
const FRAGMENT_WIDTH = 3;
const FRAGMENT_HEIGHT = 2;
const RGBA_CHANNEL_COUNT = 4;

describe('raster fragment project persistence', () => {
	it('round-trips exact fragment pixels and geometry', () => {
		const fragmentPixels = new Uint8ClampedArray(
			FRAGMENT_WIDTH * FRAGMENT_HEIGHT * RGBA_CHANNEL_COUNT,
		);
		fragmentPixels.set([17, 34, 51, 68], 0);
		fragmentPixels.set([255, 128, 64, 32], fragmentPixels.length - RGBA_CHANNEL_COUNT);
		const state = annotationSession(fragmentPixels);
		const codec = new ProjectCodec();

		const restored = codec.toEditableObjects(
			codec.parse(codec.serialize(documentSession(), [], state)),
		);

		expect(restored).toEqual(state);
	});
});

function annotationSession(pixels: Uint8ClampedArray): AnnotationSessionState {
	const state = {
		objects: [
			{
				id: 'raster-fragment',
				type: AnnotationObjectTypeId.RasterFragment,
				rect: { x: 2, y: 3, width: FRAGMENT_WIDTH, height: FRAGMENT_HEIGHT },
				pixelWidth: FRAGMENT_WIDTH,
				pixelHeight: FRAGMENT_HEIGHT,
				pixels: encodePixelBytes(pixels),
				rotation: 0,
			},
		],
		nextStep: 1,
	} as const;
	return { state, history: [state], historyIndex: 0 };
}

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray(
		DOCUMENT_SIZE * DOCUMENT_SIZE * RGBA_CHANNEL_COUNT,
	);
	return {
		width: DOCUMENT_SIZE,
		height: DOCUMENT_SIZE,
		pixels,
		baseName: 'raster-fragment',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [{ width: DOCUMENT_SIZE, height: DOCUMENT_SIZE, pixels }],
		historyIndex: 0,
		toolbarStates: {},
		layerState: DEFAULT_LAYER_STATE,
	};
}
