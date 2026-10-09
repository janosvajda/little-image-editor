import { describe, expect, it } from 'vitest';
import {
	type DocumentSessionSnapshot,
	DocumentType,
	ImageMimeType,
	ShapeToolId,
} from '../../core/document/appTypes';
import { BlendMode, DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationSessionState,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { ProjectCodec, ProjectFormatError } from './projectCodec';
import { PROJECT_FORMAT_VERSION } from './projectTypes';

const SINGLE_FORMAT_VERSION = 1;
const HALF_OPACITY = 0.5;
const OUT_OF_RANGE_OPACITY = 2;
const PIXELS = new Uint8ClampedArray([255, 0, 0, 255]);
const DAMAGED_PIXELS = btoa('abc');

function session(): DocumentSessionSnapshot {
	return {
		width: 1,
		height: 1,
		pixels: PIXELS,
		baseName: 'layers',
		savedType: ImageMimeType.Png,
		history: [{ width: 1, height: 1, pixels: PIXELS }],
		historyIndex: 0,
		layerState: DEFAULT_LAYER_STATE,
		documentType: DocumentType.Project,
	};
}

function layer(extra: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id: 'layer',
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 0, y: 0, width: 1, height: 1 },
		color: '#000000',
		width: 1,
		opacity: 1,
		fill: true,
		name: 'Sky',
		layerOpacity: HALF_OPACITY,
		blendMode: BlendMode.Multiply,
		...extra,
	};
}

function layers(object: ShapeAnnotation): AnnotationSessionState {
	const state = { objects: [object], nextStep: 1 };
	return { state, history: [state], historyIndex: 0 };
}

describe('.limg format version 1', () => {
	it('is the single supported version', () => {
		expect(PROJECT_FORMAT_VERSION).toBe(SINGLE_FORMAT_VERSION);
		const codec = new ProjectCodec();
		const source = JSON.parse(codec.serialize(session())) as { version: number };
		expect(source.version).toBe(SINGLE_FORMAT_VERSION);
		for (const version of [SINGLE_FORMAT_VERSION + 1, SINGLE_FORMAT_VERSION + 2])
			expect(() =>
				codec.parse(JSON.stringify({ ...source, version })),
			).toThrow(ProjectFormatError);
	});

	it('round-trips layer names, opacity and blend modes', () => {
		const codec = new ProjectCodec();
		const project = codec.parse(codec.serialize(session(), [], layers(layer())));
		expect(codec.toEditableObjects(project).state.objects[0]).toMatchObject({
			name: 'Sky',
			layerOpacity: HALF_OPACITY,
			blendMode: BlendMode.Multiply,
		});
	});

	it.each([
		{ blendMode: 'glow' },
		{ layerOpacity: OUT_OF_RANGE_OPACITY },
		{ name: 7 },
	])('rejects invalid layer appearance %o', (invalid) => {
		const codec = new ProjectCodec();
		const source = codec.serialize(
			session(),
			[],
			layers({ ...layer(), ...(invalid as Partial<ShapeAnnotation>) }),
		);
		expect(() => codec.parse(source)).toThrow(ProjectFormatError);
	});

	it('rejects damaged pixel data while parsing', () => {
		const codec = new ProjectCodec();
		const source = JSON.parse(codec.serialize(session())) as {
			document: { pixels: string };
		};
		source.document.pixels = DAMAGED_PIXELS;
		expect(() => codec.parse(JSON.stringify(source))).toThrow(
			'The project file contains damaged pixel data.',
		);
	});

	it('loads parsed pixels without decoding them again', () => {
		const codec = new ProjectCodec();
		const project = codec.parse(codec.serialize(session()));
		project.document.pixels = DAMAGED_PIXELS;
		expect(codec.toSession(project).pixels).toEqual(PIXELS);
	});
});
