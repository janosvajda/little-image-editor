import { EditorIconId, editorIconMarkup, presentEditorIcons } from '../../shared/style/editorIcons';
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

/** What a document is saved as: one of the image formats, or a project. */
export type SaveFormat = ImageFormat | typeof PROJECT_MIME_TYPE;
import { isImageFileType } from './formatSelectHelpers';
import {
	EDITOR_OPEN_FILE_ACCEPT,
	EDITOR_OPEN_PICKER_TYPES,
	imagePickerType,
	isProjectFile,
	isProjectFileName,
	isSavableFileName,
	savePickerTypes,
} from './openFileTypes';
import {
	downloadTarget,
	editorPlatform,
	type EditorPlatform,
	type OpenTarget,
	type PickerFileType,
	type SaveTarget,
	writeToTarget,
} from '../../platform/editorPlatform';

/** How a cancelled file operation is reported, as the browser's pickers do. */
const ABORT_ERROR_NAME = 'AbortError';
const SAVE_CANCELLED_MESSAGE = 'Saving was cancelled.';
const SAVE_PROMPT = 'Save image as';
const OPEN_FAILED_MESSAGE = 'The file could not be opened as an image or project.';
const RASTER_LAYER_WARNING =
	'This format saves a flattened image. Layers and editable objects remain available in the open document, but cannot be restored from the saved file. Continue?';

export type EditableContentDetector = () => boolean;

export class FileController {
	readonly fileInput = element<HTMLInputElement>('#fileInput');
	readonly closeDialog = element<HTMLDialogElement>('#closeImageDialog');
	readonly #saveButtons: HTMLButtonElement[];
	readonly #beforeSaveListeners = new Set<() => void>();
	/** Save targets that are downloads, which Save cannot write to again. */
	readonly #downloads = new WeakSet<SaveTarget>();
	#projectSave: ((saveAs: boolean) => Promise<void>) | null = null;
	#projectOpen: ((file: File, target?: SaveTarget) => Promise<void>) | null =
		null;

	constructor(
		readonly documentModel: CanvasDocument,
		private readonly hasEditableContent: EditableContentDetector = () => false,
		private readonly platform: Pick<EditorPlatform, 'files' | 'dialogs'> = editorPlatform(),
	) {
		presentEditorIcons();
		this.fileInput.accept = EDITOR_OPEN_FILE_ACCEPT;
		element('#saveAsButton').insertAdjacentHTML(
			'afterend',
			`<button id="exportButton" role="menuitem" disabled><span class="menu-action-copy">${editorIconMarkup(EditorIconId.Export)}Export…</span></button>`,
		);
		element('#fileMenu .menu-popover').insertAdjacentHTML(
			'beforeend',
			`<div class="menu-rule"></div><button id="closeImageButton" role="menuitem" disabled><span class="menu-action-copy">${editorIconMarkup(EditorIconId.CloseImage)}<span>Close image</span></span></button>`,
		);
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
		});
		this.bindEvents();
	}

	/**
	 * Opens an image or a project. Where the browser can pick files itself,
	 * the picked file stays the one Save writes back into.
	 */
	async open(): Promise<void> {
		if (!this.platform.files.canPickOpenTarget()) {
			this.fileInput.click();
			return;
		}
		try {
			const [target] = await this.platform.files.pickOpenTargets({
				types: EDITOR_OPEN_PICKER_TYPES,
				multiple: false,
			});
			if (target) await this.openTarget(target);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === ABORT_ERROR_NAME))
				this.platform.dialogs.alert(OPEN_FAILED_MESSAGE);
		}
	}
	onBeforeSave(listener: () => void): void {
		this.#beforeSaveListeners.add(listener);
	}
	/** Saves the document as a project, choosing its file first when asked to or when it has none. */
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

	/**
	 * Saves into the document's file, in the format its name says; a document
	 * without one is saved as a project when it is one, otherwise as Save As.
	 */
	async save(): Promise<void> {
		if (!this.documentModel.hasImage) return;
		const current = this.documentModel.fileHandle;
		if (current) await ignoringCancel(this.saveInto(current));
		else if (this.documentModel.documentType === DocumentType.Project) await this.#projectSave?.(false);
		else await this.saveAs();
	}

	/**
	 * Saves into a chosen file, by Save As or by a host such as VS Code: a
	 * project for a .limg name, otherwise the image format the name says. Later
	 * saves write there too. A declined question rejects, so a host keeps the
	 * file marked unsaved.
	 */
	async saveInto(target: SaveTarget): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (isProjectFileName(target.name)) {
			await this.saveProjectInto(target);
			return;
		}
		const type = imageFormatOfFileName(target.name)?.mimeType ?? this.documentModel.savedType;
		if (!(await this.canSaveRaster(type)))
			throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
		await this.writeDocument(target, type);
	}

	/**
	 * Chooses the file to save to, suggesting a format: by default the
	 * document's own. The chosen name decides what is written, so a project
	 * can be chosen for an image and the other way round; questions about
	 * flattening or transparency come once an image file is chosen.
	 */
	async saveAs(format: SaveFormat = this.documentFormat()): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (format === PROJECT_MIME_TYPE) {
			await this.#projectSave?.(true);
			return;
		}
		await ignoringCancel(this.saveChosen(format));
	}

	async exportImage(type: ImageFormat = this.documentModel.savedType): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (!(await this.confirmTransparency(type))) return;
		await ignoringCancel(this.exportTo(type));
	}

	requestClose(): void {
		if (this.documentModel.hasImage) this.closeDialog.showModal();
	}

	closeWithoutSaving(): void {
		this.closeDialog.close();
		this.documentModel.close();
	}

	/** The document's own format: a project, or the image format it was opened or last saved in. */
	private documentFormat(): SaveFormat {
		return this.documentModel.documentType === DocumentType.Project ? PROJECT_MIME_TYPE : this.documentModel.savedType;
	}

	private async saveChosen(format: ImageFormat): Promise<void> {
		const target = this.platform.files.canPickSaveTarget()
			? await this.pickTarget(format, savePickerTypes(format), isSavableFileName)
			: await this.promptedDownload(format);
		if (!target) return;
		if (isProjectFileName(target.name)) {
			const previous = this.documentModel.fileHandle;
			await this.saveProjectInto(target);
			if (this.#downloads.has(target)) this.documentModel.fileHandle = previous;
			return;
		}
		// Asked once the file is chosen: a project keeps every layer, an image flattens them.
		const type = imageFormatOfFileName(target.name)!.mimeType;
		if (!(await this.canSaveRaster(type))) return;
		await this.writeDocument(target, type);
	}

	/** An image copy: the open document keeps its file, format and layers. */
	private async exportTo(type: ImageFormat): Promise<void> {
		const target = this.platform.files.canPickSaveTarget()
			? await this.pickTarget(type, [imagePickerType(type)], (name) => hasValidExtension(name, type))
			: await this.promptedDownload(type);
		if (target) await this.write(target, imageFormatOfFileName(target.name)?.mimeType ?? type);
	}

	/** A project is saved into the document's file, so the chosen file becomes it first. */
	private async saveProjectInto(target: SaveTarget): Promise<void> {
		this.documentModel.fileHandle = target;
		await this.#projectSave?.(false);
	}

	/** Writes the document into its file, which Save then keeps writing to; a download is not kept. */
	private async writeDocument(target: SaveTarget, type: ImageFormat): Promise<void> {
		this.prepareDocumentForSave();
		await this.write(target, type);
		if (this.#downloads.has(target)) return;
		this.documentModel.fileHandle = target;
		this.documentModel.savedType = type;
		this.documentModel.baseName = target.name.replace(/\.[^.]+$/, '') || this.documentModel.baseName;
	}

	/** Where no file can be chosen: asks for a name, then hands the file over as a download. */
	private async promptedDownload(format: ImageFormat): Promise<SaveTarget | null> {
		const requested = await this.platform.dialogs.prompt(SAVE_PROMPT, ensureImageExtension(this.documentModel.baseName, format));
		if (!requested) return null;
		const name = isSavableFileName(requested) ? requested.trim() : ensureImageExtension(requested, format);
		const target = downloadTarget(this.platform.files, name);
		this.#downloads.add(target);
		return target;
	}

	private bindEvents(): void {
		['#openButton', '#quickOpenButton', '#emptyOpenButton'].forEach(
			(selector) =>
				element(selector).addEventListener('click', () => void this.open()),
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

	/** Asks for a file until its name is one `accepts`, reopening with the name corrected to `format`. */
	private async pickTarget(
		format: ImageFormat,
		types: readonly PickerFileType[],
		accepts: (name: string) => boolean,
	): Promise<SaveTarget> {
		let suggestion = ensureImageExtension(this.documentModel.baseName, format);
		for (;;) {
			const target = await this.platform.files.pickSaveTarget({ suggestedName: suggestion, types });
			if (accepts(target.name)) return target;
			suggestion = ensureImageExtension(target.name, format);
			this.platform.dialogs.alert(
				`The file must use the .${imageFormat(format).extensions[0]!} extension. Save As will reopen with the corrected filename.`,
			);
		}
	}

	private async write(target: SaveTarget, type: ImageFormat): Promise<void> {
		await writeToTarget(target, await this.documentModel.toBlob(type));
	}
}

/** A cancelled picker or a declined question ends a save quietly; anything else is an error. */
async function ignoringCancel(operation: Promise<void>): Promise<void> {
	try {
		await operation;
	} catch (error) {
		if (!(error instanceof DOMException && error.name === ABORT_ERROR_NAME)) throw error;
	}
}
