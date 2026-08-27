import { describe, expect, it } from 'vitest';
import {
	DocumentType,
	ImageMimeType,
	type DocumentSessionSnapshot,
} from '../../core/document/appTypes';
import { EditorLimit } from '../../core/document/editorLimits';
import { DEFAULT_LAYER_STATE } from '../../core/layers/layerTypes';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import { ProjectCodec, ProjectFormatError } from './projectCodec';

describe('.limg import safety limit', () => {
	it('rejects hostile object counts above the hard import boundary', () => {
		const codec = new ProjectCodec();
		const project = JSON.parse(
			codec.serializeEditorState({
				document: documentSession(),
				editableObjects: {
					state: { objects: [], nextStep: 1 },
					history: [{ objects: [], nextStep: 1 }],
					historyIndex: 0,
				},
			}),
		) as {
			editableObjects: {
				state: { objects: unknown[]; nextStep: number };
				history: Array<{ objects: unknown[]; nextStep: number }>;
				historyIndex: number;
			};
		};
		const objects = Array.from(
			{ length: EditorLimit.EditableObjectImportMaximum + 1 },
			(_, index) => ({
				id: `marker-${index}`,
				type: AnnotationObjectTypeId.Step,
				at: { x: index, y: index },
				value: index,
				color: '#000000',
				size: 10,
			}),
		);
		const state = { objects, nextStep: objects.length + 1 };
		project.editableObjects = {
			state,
			history: [structuredClone(state)],
			historyIndex: 0,
		};

		expect(() => codec.parse(JSON.stringify(project))).toThrow(
			ProjectFormatError,
		);
	});
});

function documentSession(): DocumentSessionSnapshot {
	const pixels = new Uint8ClampedArray([0, 0, 0, 0]);
	return {
		width: 1,
		height: 1,
		pixels,
		baseName: 'safety-limit',
		savedType: ImageMimeType.Png,
		documentType: DocumentType.Project,
		history: [{ width: 1, height: 1, pixels }],
		historyIndex: 0,
		toolbarStates: {},
		layerState: DEFAULT_LAYER_STATE,
	};
}
