import type { DocumentSessionSnapshot } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import type { AnnotationSessionState } from '../annotations/annotationTypes';
import { DRAWING_TOOL_PROJECT_COMPATIBILITY } from './projectCompatibility';

export interface EditorProjectState {
	readonly document: DocumentSessionSnapshot;
	readonly editableObjects: AnnotationSessionState;
}

export interface ProjectPersistencePort {
	capture(): EditorProjectState;
	restore(state: EditorProjectState): void;
}

export const EDITOR_PROJECT_COMPATIBILITY_CONTRACT = {
	drawing: DRAWING_TOOL_PROJECT_COMPATIBILITY,
} as const;

/** The only application boundary used by project save/open operations. */
export class ProjectEditorAdapter implements ProjectPersistencePort {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly editableObjects: Pick<
			AnnotationDocument,
			'snapshotSession' | 'restoreSession'
		>,
	) {}

	capture(): EditorProjectState {
		return {
			document: this.documentModel.snapshotSession(),
			editableObjects: this.editableObjects.snapshotSession(),
		};
	}

	restore(state: EditorProjectState): void {
		this.documentModel.restoreSession(state.document);
		this.editableObjects.restoreSession(state.editableObjects);
	}
}
