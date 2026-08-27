import { describe, expect, it } from 'vitest';
import {
	type DocumentSessionSnapshot,
	ImageMimeType,
} from '../../core/document/appTypes';
import { CoreLayerId, DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import { ProjectCodec, ProjectFormatError } from './projectCodec';
import {
	GuideOrientation,
	PROJECT_FORMAT_IDENTIFIER,
	PROJECT_FORMAT_VERSION,
} from './projectTypes';

const WIDTH = 2;
const HEIGHT = 1;
const RESOLUTION = 300;
const PIXELS = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);

function session(): DocumentSessionSnapshot {
	return {
		width: WIDTH,
		height: HEIGHT,
		pixels: PIXELS,
		baseName: 'layered-artwork',
		savedType: ImageMimeType.Webp,
		resolution: RESOLUTION,
		history: [{ width: WIDTH, height: HEIGHT, pixels: PIXELS }],
		historyIndex: 0,
		toolbarStates: { annotations: { state: { objects: [], nextStep: 1 } } },
		layerState: {
			...DEFAULT_LAYER_STATE,
			activeLayerId: CoreLayerId.Objects,
		},
	};
}

describe('.limg project codec', () => {
	it('round-trips pixels, history, layers, DPI, guides, and export preferences', () => {
		const codec = new ProjectCodec();
		const encoded = codec.serialize(session(), [
			{ orientation: GuideOrientation.Vertical, position: 24 },
		]);
		const project = codec.parse(encoded);
		const restored = codec.toSession(project);

		expect(project).toMatchObject({
			format: PROJECT_FORMAT_IDENTIFIER,
			version: PROJECT_FORMAT_VERSION,
			guides: [{ orientation: GuideOrientation.Vertical, position: 24 }],
			exportPreferences: { format: ImageMimeType.Webp },
		});
		expect(restored).toMatchObject({
			baseName: 'layered-artwork',
			resolution: RESOLUTION,
			historyIndex: 0,
			layerState: { activeLayerId: CoreLayerId.Objects },
		});
		expect(restored.pixels).toEqual(PIXELS);
		expect(restored.history[0]?.pixels).toEqual(PIXELS);
	});

	it('rejects malformed and unsupported project documents', () => {
		const codec = new ProjectCodec();
		expect(() => codec.parse('not json')).toThrow(ProjectFormatError);
		expect(() =>
			codec.parse(
				JSON.stringify({
					format: PROJECT_FORMAT_IDENTIFIER,
					version: PROJECT_FORMAT_VERSION + 1,
				}),
			),
		).toThrow(ProjectFormatError);
	});
});
