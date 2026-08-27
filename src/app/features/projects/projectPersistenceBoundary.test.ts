import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	ShapeToolId,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
} from '../annotations/annotationTypes';
import { ProjectCodec, ProjectFormatError } from './projectCodec';
import type { EditorProjectState } from './projectEditorAdapter';
import { PROJECT_CAPABILITY_MANIFEST } from './projectCompatibility';

const WIDTH = 8;
const HEIGHT = 8;
const CHANNEL_COUNT = 4;
const OBJECT_SIZE = 3;
const STROKE_WIDTH = 2;
const FULL_OPACITY = 1;
const INITIAL_ROTATION = 0;
const NEXT_MARKER = 2;

function documentState(): DocumentSessionSnapshot {
	const pixels = Uint8ClampedArray.from(
		{ length: WIDTH * HEIGHT * CHANNEL_COUNT },
		(_, index) => index % 256,
	);
	const previous = new Uint8ClampedArray(pixels);
	previous[0] = 255;
	return {
		width: WIDTH,
		height: HEIGHT,
		pixels,
		baseName: 'precise-round-trip',
		savedType: ImageMimeType.Webp,
		documentType: DocumentType.Project,
		history: [
			{ width: WIDTH, height: HEIGHT, pixels: previous },
			{ width: WIDTH, height: HEIGHT, pixels },
		],
		historyIndex: 1,
		toolbarStates: {},
		layerState: DEFAULT_LAYER_STATE,
	};
}

function everyEditableObject(): AnnotationObject[] {
	const point = { x: 1, y: 1 };
	const rect = { x: 1, y: 1, width: OBJECT_SIZE, height: OBJECT_SIZE };
	const rectangle = {
		rect,
		color: '#123456',
		width: STROKE_WIDTH,
		opacity: FULL_OPACITY,
		blur: STROKE_WIDTH,
		rotation: INITIAL_ROTATION,
	};
	return [
		{
			id: 'arrow',
			type: AnnotationObjectTypeId.Arrow,
			from: point,
			to: { x: 4, y: 4 },
			color: '#123456',
			width: STROKE_WIDTH,
		},
		{
			id: 'step',
			type: AnnotationObjectTypeId.Step,
			at: point,
			value: 1,
			color: '#123456',
			size: OBJECT_SIZE,
		},
		{
			id: 'text',
			type: AnnotationObjectTypeId.Text,
			at: point,
			text: 'Text',
			color: '#123456',
			size: OBJECT_SIZE,
			rect,
		},
		...Object.values(AnnotationObjectTypeId)
			.filter((type) =>
				[
					AnnotationObjectTypeId.Box,
					AnnotationObjectTypeId.Highlight,
					AnnotationObjectTypeId.Blur,
					AnnotationObjectTypeId.Redact,
				].includes(type as never),
			)
			.map((type) => ({ id: type, type, ...rectangle }) as AnnotationObject),
		...Object.values(ShapeToolId).map(
			(shape): AnnotationObject => ({
				id: `shape-${shape}`,
				type: AnnotationObjectTypeId.Shape,
				shape,
				rect,
				color: '#123456',
				width: STROKE_WIDTH,
				opacity: FULL_OPACITY,
				fill: false,
			}),
		),
	];
}

function editableDocument(): AnnotationDocument {
	const document = new AnnotationDocument();
	for (const object of everyEditableObject()) document.add(object);
	return document;
}

function roundTrip(state: EditorProjectState): EditorProjectState {
	const codec = new ProjectCodec();
	return codec.toEditorState(
		codec.parse(codec.serializeEditorState(state)),
	);
}

describe('typed editor/project persistence boundary', () => {
	it('preserves exact raster bytes and every editable object over repeated saves', () => {
		const editable = editableDocument();
		const first = roundTrip({
			document: documentState(),
			editableObjects: editable.snapshotSession(),
		});

		expect(first.document.pixels).toEqual(documentState().pixels);
		expect(first.document.history).toEqual(documentState().history);
		expect(first.editableObjects).toEqual(editable.snapshotSession());

		const restored = new AnnotationDocument();
		restored.restoreSession(first.editableObjects);
		for (const object of [...restored.state.objects]) {
			restored.select(object.id);
			restored.move(object.id, { x: 1, y: 1 });
		}
		const edited = restored.snapshotSession();
		const second = roundTrip({ document: first.document, editableObjects: edited });

		expect(second.document.pixels).toEqual(first.document.pixels);
		expect(second.document.history).toEqual(first.document.history);
		expect(second.editableObjects).toEqual(edited);
		expect(second.editableObjects.state.objects).toHaveLength(
			everyEditableObject().length,
		);
		expect(second.editableObjects.state.nextStep).toBe(NEXT_MARKER);
	});

	it('embeds the exhaustive editor capability contract and rejects mismatches', () => {
		const codec = new ProjectCodec();
		const source = codec.serializeEditorState({
			document: documentState(),
			editableObjects: editableDocument().snapshotSession(),
		});
		const project = codec.parse(source);
		expect(project.capabilities).toEqual(PROJECT_CAPABILITY_MANIFEST);

		const incompatible = JSON.parse(source) as {
			capabilities: { drawingTools: string[] };
		};
		incompatible.capabilities.drawingTools.pop();
		expect(() => codec.parse(JSON.stringify(incompatible))).toThrow(
			ProjectFormatError,
		);
	});
});
