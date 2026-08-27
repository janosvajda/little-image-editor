import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	ShapeToolId,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import {
	AnnotationObjectTypeId,
	type AnnotationObject,
	type AnnotationSessionState,
} from '../annotations/annotationTypes';
import { ProjectCodec, ProjectFormatError } from './projectCodec';

const CANVAS_SIZE = 32;
const RGBA_CHANNEL_COUNT = 4;
const STROKE_WIDTH = 3;
const OPACITY = 0.5;
const BLUR_RADIUS = 8;
const ROTATION = 15;
const MARKER_VALUE = 2;
const TEXT_SIZE = 16;

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray(
		CANVAS_SIZE * CANVAS_SIZE * RGBA_CHANNEL_COUNT,
	);
	return {
		width: CANVAS_SIZE,
		height: CANVAS_SIZE,
		pixels,
		baseName: 'every-editable-object',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [{ width: CANVAS_SIZE, height: CANVAS_SIZE, pixels }],
		historyIndex: 0,
		toolbarStates: {},
		layerState: DEFAULT_LAYER_STATE,
	};
}

function editableObjects(): AnnotationSessionState {
	const rect = { x: 2, y: 3, width: 12, height: 9 };
	const commonRect = {
		rect,
		color: '#123456',
		width: STROKE_WIDTH,
		opacity: OPACITY,
		blur: BLUR_RADIUS,
		rotation: ROTATION,
	};
	const objects: AnnotationObject[] = [
		{
			id: 'arrow',
			type: AnnotationObjectTypeId.Arrow,
			from: { x: 1, y: 2 },
			to: { x: 9, y: 10 },
			color: '#abcdef',
			width: STROKE_WIDTH,
			rotation: ROTATION,
		},
		{
			id: 'step',
			type: AnnotationObjectTypeId.Step,
			at: { x: 4, y: 5 },
			value: MARKER_VALUE,
			color: '#fedcba',
			size: TEXT_SIZE,
			rotation: ROTATION,
		},
		{
			id: 'text',
			type: AnnotationObjectTypeId.Text,
			at: { x: 6, y: 7 },
			text: 'Editable text',
			color: '#112233',
			size: TEXT_SIZE,
			rect,
			rotation: ROTATION,
		},
		...([
			AnnotationObjectTypeId.Box,
			AnnotationObjectTypeId.Highlight,
			AnnotationObjectTypeId.Blur,
			AnnotationObjectTypeId.Redact,
		] as const).map((type) => ({ id: type, type, ...commonRect })),
		...Object.values(ShapeToolId).map((shape) => ({
			id: `shape-${shape}`,
			type: AnnotationObjectTypeId.Shape,
			shape,
			rect,
			rotation: ROTATION,
			color: '#445566',
			width: STROKE_WIDTH,
			opacity: OPACITY,
			fill: true,
		})),
	];
	const state = { objects, nextStep: MARKER_VALUE + 1 };
	return { state, history: [structuredClone(state)], historyIndex: 0 };
}

describe('.limg editable-object compatibility', () => {
	it('round-trips every annotation and generic shape type without flattening', () => {
		const codec = new ProjectCodec();
		const source = editableObjects();
		const project = codec.parse(
			codec.serialize(documentSession(), [], source),
		);

		expect(project.document.documentType).toBe(DocumentType.Project);
		expect(codec.toEditableObjects(project)).toEqual(source);
		expect(project.editableObjects.state.objects).toHaveLength(
			Object.values(ShapeToolId).length + 7,
		);
	});

	it('rejects a project containing an unsupported editable object', () => {
		const codec = new ProjectCodec();
		const project = JSON.parse(
			codec.serialize(documentSession(), [], editableObjects()),
		) as { editableObjects: { state: { objects: unknown[] } } };
		project.editableObjects.state.objects[0] = {
			id: 'unsupported',
			type: 'unsupported-object',
		};

		expect(() => codec.parse(JSON.stringify(project))).toThrow(
			ProjectFormatError,
		);
	});
});
