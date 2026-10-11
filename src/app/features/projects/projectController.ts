import { emptyAnnotationSession } from '../annotations/contentLayerStructure';
import type { CanvasDocument } from '../../core/document/imageDocument';
import {
	DEFAULT_DOCUMENT_NAME,
	DocumentType,
} from '../../core/document/appTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	ProjectEditorAdapter,
	type ProjectPersistencePort,
} from './projectEditorAdapter';
import { ProjectCodec, ProjectFormatError } from './projectCodec';
import { PROJECT_EXTENSION, PROJECT_MIME_TYPE } from './projectTypes';
import { isProjectFileName, PROJECT_PICKER_TYPE } from '../files/openFileTypes';
import {
	editorPlatform,
	type EditorPlatform,
	type SaveTarget,
	writeToTarget,
} from '../../platform/editorPlatform';

type EditableObjectDocument = Pick<
	AnnotationDocument,
	'snapshotSession' | 'restoreSession'
>;

/**
 * Reads and writes `.limg` projects. The file a project is saved to is the
 * document's own file, the same one Save writes to in every edition.
 */
export class ProjectController {
	readonly #persistence: ProjectPersistencePort;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly codec = new ProjectCodec(),
		editableObjects?: EditableObjectDocument,
		private readonly platform: Pick<EditorPlatform, 'files' | 'dialogs'> = editorPlatform(),
	) {
		this.#persistence = new ProjectEditorAdapter(
			documentModel,
			editableObjects ?? fallbackEditableObjects(),
		);
	}

	async save(saveAs = false): Promise<void> {
		if (!this.documentModel.hasImage) return;
		try {
			const current = saveAs ? null : this.projectFile();
			this.documentModel.documentType = DocumentType.Project;
			const contents = this.codec.serializeEditorState(
				this.#persistence.capture(),
			);
			const blob = new Blob([contents], { type: PROJECT_MIME_TYPE });
			if (current) {
				await writeToTarget(current, blob);
				return;
			}
			if (this.platform.files.canPickSaveTarget()) {
				const handle = await this.platform.files.pickSaveTarget({
					suggestedName: projectFileName(this.documentModel.baseName),
					types: [PROJECT_PICKER_TYPE],
				});
				await writeToTarget(handle, blob);
				this.documentModel.fileHandle = handle;
				return;
			}
			const requestedName = await this.platform.dialogs.prompt(
				'Save project as',
				projectFileName(this.documentModel.baseName),
			);
			if (!requestedName) return;
			this.platform.files.download(blob, projectFileName(requestedName));
		} catch (error) {
			this.handleError(error);
		}
	}

	/** Saves the project into a chosen file; later saves write there too. */
	async saveInto(target: SaveTarget): Promise<void> {
		this.documentModel.fileHandle = target;
		await this.save();
	}

	/** Opens a project file; with a target, Save writes back into that file. */
	async openFile(file: File, target: SaveTarget | null = null): Promise<void> {
		try {
			await this.load(file);
			this.documentModel.fileHandle = target;
		} catch (error) {
			this.handleError(error);
		}
	}

	private async load(file: File): Promise<void> {
		const project = this.codec.parse(await file.text());
		this.documentModel.documentType = DocumentType.Project;
		this.#persistence.restore(this.codec.toEditorState(project));
	}

	/** The document's file when it is a project, which Save writes back into. */
	private projectFile(): SaveTarget | null {
		const file = this.documentModel.fileHandle;
		return file && isProjectFileName(file.name) ? file : null;
	}

	private handleError(error: unknown): void {
		if (error instanceof DOMException && error.name === 'AbortError') return;
		this.platform.dialogs.alert(
			error instanceof ProjectFormatError
				? error.message
				: 'The project could not be opened or saved.',
		);
	}
}

function fallbackEditableObjects(): EditableObjectDocument {
	return {
		snapshotSession: () => emptyAnnotationSession(),
		restoreSession: () => undefined,
	};
}

function projectFileName(name: string): string {
	const normalized = name.trim().replace(/\.[^.]+$/, '');
	return `${normalized || DEFAULT_DOCUMENT_NAME}.${PROJECT_EXTENSION}`;
}
