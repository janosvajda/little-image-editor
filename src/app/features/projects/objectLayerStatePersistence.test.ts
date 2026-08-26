import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import type { AnnotationSessionState } from '../annotations/annotationTypes';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { ProjectCodec } from './projectCodec';

const CanvasFixture = { Size: 8, Channels: 4 } as const;

describe('.limg object layer state', () => {
	it('round-trips object visibility and locking', () => {
		const state = {
			objects: [
				{
					id: 'locked-hidden-box',
					type: AnnotationObjectTypeId.Box,
					rect: { x: 1, y: 1, width: 4, height: 4 },
					color: '#123456',
					width: 1,
					opacity: 1,
					blur: 0,
					visible: false,
					locked: true,
				},
			],
			nextStep: 1,
		} satisfies AnnotationSessionState['state'];
		const objects: AnnotationSessionState = {
			state,
			history: [structuredClone(state)],
			historyIndex: 0,
		};
		const codec = new ProjectCodec();
		const restored = codec.toEditableObjects(
			codec.parse(codec.serialize(documentSession(), [], objects)),
		);

		expect(restored).toEqual(objects);
	});
});

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray(
		CanvasFixture.Size * CanvasFixture.Size * CanvasFixture.Channels,
	);
	return {
		width: CanvasFixture.Size,
		height: CanvasFixture.Size,
		pixels,
		baseName: 'object-layer-state',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [
			{ width: CanvasFixture.Size, height: CanvasFixture.Size, pixels },
		],
		historyIndex: 0,
		toolbarStates: {},
		layerState: DEFAULT_LAYER_STATE,
	};
}
