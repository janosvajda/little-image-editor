import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import { ProjectCodec } from './projectCodec';
import { decodePixelBytes, encodePixelBytes } from './pixelDataCodec';
import { PROJECT_FORMAT_VERSION } from './projectTypes';

const CanvasSize = { Width: 800, Height: 600 } as const;
const RgbaChannelCount = 4;
const OpaqueChannel = 255;
const HistorySnapshotCount = 5;
const CompactProjectMaximumBytes = 100_000;

describe('compact lossless project persistence', () => {
	it('keeps a mostly blank 800 × 600 project compact without losing a byte', () => {
		const pixels = mostlyBlankCanvas();
		const state = session(pixels);
		const encoded = new ProjectCodec().serialize(state);
		const codec = new ProjectCodec();
		const project = codec.parse(encoded);
		const restored = codec.toSession(project);

		expect(new Blob([encoded]).size).toBeLessThan(CompactProjectMaximumBytes);
		expect(project.version).toBe(PROJECT_FORMAT_VERSION);
		expect(pixelBytesEqual(restored.pixels, pixels)).toBe(true);
		expect(restored.history).toHaveLength(HistorySnapshotCount);
		for (const snapshot of restored.history)
			expect(pixelBytesEqual(snapshot.pixels, pixels)).toBe(true);
	});

	it('uses raw storage when compression would grow noisy pixel data', () => {
		const pixels = Uint8ClampedArray.from(
			{ length: 4_096 },
			(_, index) => (index * 73 + 19) % 256,
		);
		const encoded = encodePixelBytes(pixels);

		expect(encoded.startsWith('rle:')).toBe(false);
		expect(decodePixelBytes(encoded)).toEqual(pixels);
	});
});

function mostlyBlankCanvas(): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(
		CanvasSize.Width * CanvasSize.Height * RgbaChannelCount,
	);
	for (let index = 0; index < pixels.length; index += RgbaChannelCount) {
		pixels[index] = OpaqueChannel;
		pixels[index + 1] = OpaqueChannel;
		pixels[index + 2] = OpaqueChannel;
		pixels[index + 3] = OpaqueChannel;
	}
	for (let coordinate = 100; coordinate < 500; coordinate += 1) {
		const offset =
			(coordinate * CanvasSize.Width + coordinate) * RgbaChannelCount;
		pixels[offset] = 0;
		pixels[offset + 1] = 0;
		pixels[offset + 2] = 0;
	}
	return pixels;
}

function session(pixels: Uint8ClampedArray): DocumentSessionSnapshot {
	return {
		width: CanvasSize.Width,
		height: CanvasSize.Height,
		pixels,
		baseName: 'compact-project',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: Array.from({ length: HistorySnapshotCount }, () => ({
			width: CanvasSize.Width,
			height: CanvasSize.Height,
			pixels: new Uint8ClampedArray(pixels),
		})),
		historyIndex: HistorySnapshotCount - 1,
		toolbarStates: {},
		layerState: DEFAULT_LAYER_STATE,
	};
}

function pixelBytesEqual(
	left: Uint8ClampedArray,
	right: Uint8ClampedArray,
): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1)
		if (left[index] !== right[index]) return false;
	return true;
}
