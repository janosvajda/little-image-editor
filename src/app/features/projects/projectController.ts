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

interface ProjectPickerWindow extends Window {
	showOpenFilePicker?: (options: object) => Promise<FileSystemFileHandle[]>;
	showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle>;
}

const OBJECT_URL_RELEASE_DELAY_MS = 1_000;

type EditableObjectDocument = Pick<
	AnnotationDocument,
	'snapshotSession' | 'restoreSession'
>;

export class ProjectController {
	readonly #openButton = menuButton('Open project…');
	readonly #saveButton = menuButton('Save project…');
	readonly #input = document.createElement('input');
	#fileHandle: FileSystemFileHandle | null = null;
	readonly #persistence: ProjectPersistencePort;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly codec = new ProjectCodec(),
		editableObjects?: EditableObjectDocument,
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
			const picker = (window as ProjectPickerWindow).showOpenFilePicker;
			if (picker) {
				const [handle] = await picker({
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
				await writeBlob(this.#fileHandle, blob);
				return;
			}
			const picker = (window as ProjectPickerWindow).showSaveFilePicker;
			if (picker) {
				const handle = await picker({
					suggestedName: projectFileName(this.documentModel.baseName),
					types: [projectPickerType()],
				});
				await writeBlob(handle, blob);
				this.#fileHandle = handle;
				return;
			}
			const requestedName = window.prompt(
				'Save project as',
				projectFileName(this.documentModel.baseName),
			);
			if (!requestedName) return;
			downloadBlob(blob, projectFileName(requestedName));
		} catch (error) {
			this.handleError(error);
		}
	}

	async openFile(file: File): Promise<void> {
		try {
			await this.load(file);
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
		window.alert(
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

function projectPickerType(): object {
	return {
		description: 'Little Image Editor project',
		accept: { [PROJECT_MIME_TYPE]: [`.${PROJECT_EXTENSION}`] },
	};
}

function projectFileName(name: string): string {
	const normalized = name.trim().replace(/\.[^.]+$/, '');
	return `${normalized || DEFAULT_DOCUMENT_NAME}.${PROJECT_EXTENSION}`;
}

async function writeBlob(
	handle: FileSystemFileHandle,
	blob: Blob,
): Promise<void> {
	const writable = await handle.createWritable();
	await writable.write(blob);
	await writable.close();
}

function downloadBlob(blob: Blob, filename: string): void {
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href), OBJECT_URL_RELEASE_DELAY_MS);
}
