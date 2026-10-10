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
import { element } from '../../shared/dom/domHelpers';
import { ProjectCodec, ProjectFormatError } from './projectCodec';
import { PROJECT_EXTENSION, PROJECT_MIME_TYPE } from './projectTypes';
import {
	editorPlatform,
	type PickerFileType,
	type EditorPlatform,
	type SaveTarget,
	writeToTarget,
} from '../../platform/editorPlatform';

type EditableObjectDocument = Pick<
	AnnotationDocument,
	'snapshotSession' | 'restoreSession'
>;

export class ProjectController {
	readonly #openButton = menuButton('Open project…');
	readonly #saveButton = menuButton('Save project…');
	readonly #input = document.createElement('input');
	#fileHandle: SaveTarget | null = null;
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
		this.#openButton.id = 'openProjectButton';
		this.#saveButton.id = 'saveProjectButton';
		this.#saveButton.disabled = true;
		this.#input.type = 'file';
		this.#input.id = 'projectFileInput';
		this.#input.accept = `.${PROJECT_EXTENSION},${PROJECT_MIME_TYPE}`;
		this.#input.hidden = true;
		element('#openButton').after(this.#openButton);
		element('#exportButton').after(this.#saveButton);
		document.body.append(this.#input);
		this.bindEvents();
	}

	async open(): Promise<void> {
		try {
			if (this.platform.files.canPickOpenTarget()) {
				const [handle] = await this.platform.files.pickOpenTargets({
					types: [projectPickerType()],
					multiple: false,
				});
				if (!handle) return;
				await this.load(await handle.getFile());
				this.#fileHandle = handle;
				return;
			}
			this.#input.click();
		} catch (error) {
			this.handleError(error);
		}
	}

	async save(saveAs = false): Promise<void> {
		if (!this.documentModel.hasImage) return;
		try {
			if (saveAs) this.#fileHandle = null;
			this.documentModel.documentType = DocumentType.Project;
			const contents = this.codec.serializeEditorState(
				this.#persistence.capture(),
			);
			const blob = new Blob([contents], { type: PROJECT_MIME_TYPE });
			if (this.#fileHandle) {
				await writeToTarget(this.#fileHandle, blob);
				return;
			}
			if (this.platform.files.canPickSaveTarget()) {
				const handle = await this.platform.files.pickSaveTarget({
					suggestedName: projectFileName(this.documentModel.baseName),
					types: [projectPickerType()],
				});
				await writeToTarget(handle, blob);
				this.#fileHandle = handle;
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

	/** Saves the project into a file a host chose; later saves write there too. */
	async saveInto(target: SaveTarget): Promise<void> {
		this.#fileHandle = target;
		await this.save();
	}

	/** Opens a project file; with a target, Save writes back into that file. */
	async openFile(file: File, target: SaveTarget | null = null): Promise<void> {
		try {
			await this.load(file);
			this.#fileHandle = target;
		} catch (error) {
			this.handleError(error);
		}
	}

	private async load(file: File): Promise<void> {
		const project = this.codec.parse(await file.text());
		this.documentModel.documentType = DocumentType.Project;
		this.#persistence.restore(this.codec.toEditorState(project));
		this.#fileHandle = null;
	}

	private bindEvents(): void {
		this.#openButton.addEventListener('click', () => void this.open());
		this.#saveButton.addEventListener('click', () => void this.save());
		this.#input.addEventListener('change', () => {
			const file = this.#input.files?.[0];
			if (file) void this.openFile(file);
			this.#input.value = '';
		});
		this.documentModel.onDocumentChange(({ hasImage }) => {
			this.#saveButton.disabled = !hasImage;
			if (!hasImage) this.#fileHandle = null;
		});
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

function menuButton(label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.setAttribute('role', 'menuitem');
	const text = document.createElement('span');
	text.textContent = label;
	button.append(text);
	return button;
}

function projectPickerType(): PickerFileType {
	return {
		description: 'Little Image Editor project',
		accept: { [PROJECT_MIME_TYPE]: [`.${PROJECT_EXTENSION}`] },
	};
}

function projectFileName(name: string): string {
	const normalized = name.trim().replace(/\.[^.]+$/, '');
	return `${normalized || DEFAULT_DOCUMENT_NAME}.${PROJECT_EXTENSION}`;
}
