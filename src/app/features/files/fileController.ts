import { element } from '../../shared/dom/domHelpers';
import {
	ensureImageExtension,
	hasValidExtension,
} from './fileNameHelpers';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { ImageFormat } from '../../core/document/appTypes';
import { DocumentType } from '../../core/document/appTypes';
import { imageFormat, imageFormatOfFileName } from '../../core/document/imageFormats';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
import {
	isImageFileType,
	isProjectFileType,
	populateSaveFileTypeSelect,
} from './formatSelectHelpers';
import { EDITOR_OPEN_FILE_ACCEPT, isProjectFile } from './openFileTypes';
import {
	editorPlatform,
	type EditorPlatform,
	type OpenTarget,
	type SaveTarget,
	writeToTarget,
} from '../../platform/editorPlatform';

/** How a cancelled file operation is reported, as the browser's pickers do. */
const ABORT_ERROR_NAME = 'AbortError';
const SAVE_CANCELLED_MESSAGE = 'Saving was cancelled.';
const RASTER_LAYER_WARNING =
	'This format saves a flattened image. Layers and editable objects remain available in the open document, but cannot be restored from the saved file. Continue?';

export type EditableContentDetector = () => boolean;

export class FileController {
	readonly fileInput = element<HTMLInputElement>('#fileInput');
	readonly closeDialog = element<HTMLDialogElement>('#closeImageDialog');
	readonly #format = element<HTMLSelectElement>('#formatSelect');
	readonly #saveButtons: HTMLButtonElement[];
	readonly #beforeSaveListeners = new Set<() => void>();
	#projectSave: ((saveAs: boolean) => Promise<void>) | null = null;
	#projectOpen: ((file: File, target?: SaveTarget) => Promise<void>) | null =
		null;

	constructor(
		readonly documentModel: CanvasDocument,
		private readonly hasEditableContent: EditableContentDetector = () => false,
		private readonly platform: Pick<EditorPlatform, 'files' | 'dialogs'> = editorPlatform(),
	) {
		this.fileInput.accept = EDITOR_OPEN_FILE_ACCEPT;
		element('#saveAsButton').insertAdjacentHTML(
			'afterend',
			'<div class="menu-rule"></div><button id="exportButton" role="menuitem" disabled><span>Export…</span></button>',
		);
		element('#exportButton').insertAdjacentHTML(
			'afterend',
			'<div class="menu-rule"></div><button id="closeImageButton" role="menuitem" disabled><span class="menu-action-copy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v10H3zM8 12l8 6m0-6-8 6"/></svg><span>Close image</span></span></button>',
		);
		populateSaveFileTypeSelect(this.#format);
		this.#saveButtons = [
			element<HTMLButtonElement>('#saveButton'),
			element<HTMLButtonElement>('#saveAsButton'),
			element<HTMLButtonElement>('#exportButton'),
			element<HTMLButtonElement>('#quickSaveButton'),
			element<HTMLButtonElement>('#closeImageButton'),
			element<HTMLButtonElement>('#quickCloseImageButton'),
		];
		this.documentModel.onDocumentChange(({ hasImage }) => {
			this.#saveButtons.forEach((button) => {
				button.disabled = !hasImage;
			});
			if (hasImage)
				this.#format.value =
					this.documentModel.documentType === DocumentType.Project
						? PROJECT_MIME_TYPE
						: this.documentModel.savedType;
		});
		this.bindEvents();
	}

	open(): void {
		this.fileInput.click();
	}
	onBeforeSave(listener: () => void): void {
		this.#beforeSaveListeners.add(listener);
	}
	setProjectSaveHandler(handler: (saveAs: boolean) => Promise<void>): void {
		this.#projectSave = handler;
	}
	setProjectOpenHandler(
		handler: (file: File, target?: SaveTarget) => Promise<void>,
	): void {
		this.#projectOpen = handler;
	}

	/** Opens a file the host owns; Save then writes back into it. */
	async openTarget(target: OpenTarget): Promise<void> {
		const file = await target.getFile();
		if (isProjectFile(file)) {
			await this.#projectOpen?.(file, target);
			return;
		}
		if (isImageFileType(file.type)) this.documentModel.savedType = file.type;
		await this.documentModel.load(file);
		this.documentModel.fileHandle = target;
	}

	async save(): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (isProjectFileType(this.#format.value)) {
			await this.#projectSave?.(
				this.documentModel.documentType !== DocumentType.Project,
			);
			return;
		}
		if (!this.documentModel.fileHandle) {
			await this.saveAs();
			return;
		}
		if (!(await this.canSaveRaster(this.documentModel.savedType))) return;
		this.prepareDocumentForSave();
		await this.write(
			this.documentModel.fileHandle,
			this.documentModel.savedType,
		);
	}

	/**
	 * Saves into a file a host chose, in the image format its name says. A
	 * declined question rejects, so the host keeps the file marked unsaved.
	 */
	async saveInto(target: SaveTarget): Promise<void> {
		if (!this.documentModel.hasImage) return;
		const type =
			imageFormatOfFileName(target.name)?.mimeType ?? this.documentModel.savedType;
		if (!(await this.canSaveRaster(type)))
			throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
		this.prepareDocumentForSave();
		await this.write(target, type);
		this.documentModel.fileHandle = target;
		this.documentModel.savedType = type;
	}

	async saveAs(): Promise<void> {
		if (isProjectFileType(this.#format.value)) {
			await this.#projectSave?.(true);
			return;
		}
		await this.saveCopy(true);
	}

	async exportImage(): Promise<void> {
		await this.saveCopy(false);
	}

	requestClose(): void {
		if (this.documentModel.hasImage) this.closeDialog.showModal();
	}

	closeWithoutSaving(): void {
		this.closeDialog.close();
		this.documentModel.close();
	}

	private async saveCopy(updateDocument: boolean): Promise<void> {
		if (!this.documentModel.hasImage) return;
		const type = this.selectedRasterFormat();
		if (!(await this.canSaveRaster(type))) return;
		try {
			if (this.platform.files.canPickSaveTarget()) {
				const target = await this.pickTarget(
					ensureImageExtension(this.documentModel.baseName, type),
					type,
				);
				if (updateDocument) this.prepareDocumentForSave();
				await this.write(target, type);
				if (updateDocument) {
					this.documentModel.fileHandle = target;
					this.documentModel.savedType = type;
					this.documentModel.baseName =
						target.name.replace(/\.[^.]+$/, '') || this.documentModel.baseName;
				}
				return;
			}
			const requestedName = await this.platform.dialogs.prompt(
				'Save image as',
				ensureImageExtension(this.documentModel.baseName, type),
			);
			const filename = requestedName
				? ensureImageExtension(requestedName, type)
				: null;
			if (!filename) return;
			if (updateDocument) this.prepareDocumentForSave();
			this.platform.files.download(await this.documentModel.toBlob(type), filename);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === ABORT_ERROR_NAME))
				throw error;
		}
	}

	private selectedRasterFormat(): ImageFormat {
		return isImageFileType(this.#format.value)
			? this.#format.value
			: this.documentModel.savedType;
	}

	private bindEvents(): void {
		['#openButton', '#quickOpenButton', '#emptyOpenButton'].forEach(
			(selector) =>
				element(selector).addEventListener('click', () => this.open()),
		);
		this.fileInput.addEventListener('change', () => {
			const file = this.fileInput.files?.[0];
			if (!file) return;
			const openOperation = isProjectFile(file)
				? this.#projectOpen?.(file)
				: this.documentModel.load(file);
			void Promise.resolve(openOperation).finally(() => {
				this.fileInput.value = '';
			});
		});
		element('#saveButton').addEventListener('click', () => void this.save());
		element('#saveAsButton').addEventListener(
			'click',
			() => void this.saveAs(),
		);
		element('#exportButton').addEventListener(
			'click',
			() => void this.exportImage(),
		);
		['#closeImageButton', '#quickCloseImageButton'].forEach((selector) =>
			element(selector).addEventListener('click', () => this.requestClose()),
		);
		element('#confirmCloseImageButton').addEventListener('click', (event) => {
			event.preventDefault();
			this.closeWithoutSaving();
		});
		this.closeDialog
			.querySelectorAll<HTMLButtonElement>('[value="cancel"]')
			.forEach((button) =>
				button.addEventListener('click', (event) => {
					event.preventDefault();
					this.closeDialog.close();
				}),
			);
		element('#quickSaveButton').addEventListener(
			'click',
			() => void this.save(),
		);
	}

	private confirmTransparency(type: ImageFormat): Promise<boolean> {
		const format = imageFormat(type);
		if (format.supportsTransparency || !this.documentModel.containsTransparency())
			return Promise.resolve(true);
		return this.platform.dialogs.confirm(
			`${format.label} does not support transparency. Transparent pixels will be replaced with white. Continue?`,
		);
	}

	private async canSaveRaster(type: ImageFormat): Promise<boolean> {
		return (
			(await this.confirmRasterFlattening()) &&
			(await this.confirmTransparency(type))
		);
	}

	private confirmRasterFlattening(): Promise<boolean> {
		return this.hasEditableContent()
			? this.platform.dialogs.confirm(RASTER_LAYER_WARNING)
			: Promise.resolve(true);
	}

	private prepareDocumentForSave(): void {
		this.#beforeSaveListeners.forEach((listener) => listener());
	}

	private async pickTarget(
		suggestedName: string,
		type: ImageFormat,
	): Promise<SaveTarget> {
		let suggestion = suggestedName;
		for (;;) {
			const format = imageFormat(type);
			const extension = format.extensions[0]!;
			const target = await this.platform.files.pickSaveTarget({
				suggestedName: suggestion,
				types: [
					{
						description: `${format.label} image`,
						accept: { [type]: format.extensions.map((value) => `.${value}`) },
					},
				],
			});
			if (hasValidExtension(target.name, type)) return target;
			suggestion = ensureImageExtension(target.name, type);
			this.platform.dialogs.alert(
				`The file must use the .${extension} extension. Save As will reopen with the corrected filename.`,
			);
		}
	}

	private async write(target: SaveTarget, type: ImageFormat): Promise<void> {
		await writeToTarget(target, await this.documentModel.toBlob(type));
	}
}
