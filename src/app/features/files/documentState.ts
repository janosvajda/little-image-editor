import type { DocumentSessionSnapshot } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import type { AnnotationSessionState } from '../annotations/annotationTypes';

/** A whole document as one state: its image and its editable items, as an SVG opens into and is written from. */
export interface EditorDocumentState {
	readonly document: DocumentSessionSnapshot;
	readonly editableObjects: AnnotationSessionState;
}

/** Gives a document a whole state back, as an SVG is opened into it. */
export class DocumentStateAdapter {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly editableObjects: Pick<AnnotationDocument, 'restoreSession'>,
	) {}

	restore(state: EditorDocumentState): void {
		this.documentModel.restoreSession(state.document);
		this.editableObjects.restoreSession(state.editableObjects);
	}
}
