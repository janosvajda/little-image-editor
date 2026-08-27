import { element } from '../../shared/dom/domHelpers';
import {
	ensureImageExtension,
	hasValidExtension,
	preferredExtension,
} from './fileNameHelpers';
import { CanvasDocument } from '../../core/document/imageDocument';
import type { ImageFormat } from '../../core/document/appTypes';
import { DocumentType } from '../../core/document/appTypes';
import { imageFormat } from '../../core/document/imageFormats';
import { populateImageFormatSelect } from './formatSelectHelpers';

type PickerWindow = Window & {
	showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle>;
};
const OBJECT_URL_RELEASE_DELAY_MS = 1_000;
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

	constructor(
		readonly documentModel: CanvasDocument,
		private readonly hasEditableContent: EditableContentDetector = () => false,
	) {
		this.fileInput.accept = 'image/png,image/jpeg,image/webp';
		element('#saveAsButton').insertAdjacentHTML(
			'afterend',
			'<div class="menu-rule"></div><button id="exportButton" role="menuitem" disabled><span>Export…</span></button>',
		);
		element('#exportButton').insertAdjacentHTML(
			'afterend',
			'<div class="menu-rule"></div><button id="closeImageButton" role="menuitem" disabled><span class="menu-action-copy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v10H3zM8 12l8 6m0-6-8 6"/></svg><span>Close image</span></span></button>',
		);
		populateImageFormatSelect(this.#format);
		this.#saveButtons = [
			element<HTMLButtonElement>('#saveButton'),
			element<HTMLButtonElement>('#saveAsButton'),
			element<HTMLButtonElement>('#exportButton'),
			element<HTMLButtonElement>('#quickSaveButton'),
			element<HTMLButtonElement>('#closeImageButton'),
			element<HTMLButtonElement>('#quickCloseImageButton'),
		];
		this.documentModel.onDocumentChange(({ hasImage }) =>
			this.#saveButtons.forEach((button) => {
				button.disabled = !hasImage;
			}),
		);
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

	async save(): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (this.documentModel.documentType === DocumentType.Project) {
			await this.#projectSave?.(false);
			return;
		}
		if (!this.documentModel.fileHandle) {
			await this.saveAs();
			return;
		}
		if (!this.canSaveRaster(this.documentModel.savedType)) return;
		this.prepareDocumentForSave();
		await this.write(
			this.documentModel.fileHandle,
			this.documentModel.savedType,
		);
	}

	async saveAs(): Promise<void> {
		if (this.documentModel.documentType === DocumentType.Project) {
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
		const type = this.#format.value as ImageFormat;
		if (!this.canSaveRaster(type)) return;
		try {
			const picker = (window as PickerWindow).showSaveFilePicker;
			if (picker) {
				const handle = await this.pickHandle(
					picker,
					ensureImageExtension(this.documentModel.baseName, type),
					type,
				);
				if (updateDocument) this.prepareDocumentForSave();
				await this.write(handle, type);
				if (updateDocument) {
					this.documentModel.fileHandle = handle;
					this.documentModel.savedType = type;
					this.documentModel.baseName =
						handle.name.replace(/\.[^.]+$/, '') || this.documentModel.baseName;
				}
				return;
			}
			const requestedName = window.prompt(
				'Save image as',
				ensureImageExtension(this.documentModel.baseName, type),
			);
			const filename = requestedName
				? ensureImageExtension(requestedName, type)
				: null;
			if (!filename) return;
			if (updateDocument) this.prepareDocumentForSave();
			const link = document.createElement('a');
			link.href = URL.createObjectURL(await this.documentModel.toBlob(type));
			link.download = filename;
			link.click();
			setTimeout(
				() => URL.revokeObjectURL(link.href),
				OBJECT_URL_RELEASE_DELAY_MS,
			);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError'))
				throw error;
		}
	}

	private bindEvents(): void {
		['#openButton', '#quickOpenButton', '#emptyOpenButton'].forEach(
			(selector) =>
				element(selector).addEventListener('click', () => this.open()),
		);
		this.fileInput.addEventListener('change', () => {
			const file = this.fileInput.files?.[0];
			if (!file) return;
			void this.documentModel.load(file).finally(() => {
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

	private confirmTransparency(type: ImageFormat): boolean {
		const format = imageFormat(type);
		return (
			format.supportsTransparency ||
			!this.documentModel.containsTransparency() ||
			window.confirm(
				`${format.label} does not support transparency. Transparent pixels will be replaced with white. Continue?`,
			)
		);
	}

	private canSaveRaster(type: ImageFormat): boolean {
		return this.confirmRasterFlattening() && this.confirmTransparency(type);
	}

	private confirmRasterFlattening(): boolean {
		return !this.hasEditableContent() || window.confirm(RASTER_LAYER_WARNING);
	}

	private prepareDocumentForSave(): void {
		this.#beforeSaveListeners.forEach((listener) => listener());
	}

	private async pickHandle(
		picker: NonNullable<PickerWindow['showSaveFilePicker']>,
		suggestedName: string,
		type: ImageFormat,
	): Promise<FileSystemFileHandle> {
		let suggestion = suggestedName;
		for (;;) {
			const format = imageFormat(type);
			const extension = format.extensions[0]!;
			const handle = await picker({
				suggestedName: suggestion,
				types: [
					{
						description: `${format.label} image`,
						accept: { [type]: format.extensions.map((value) => `.${value}`) },
					},
				],
			});
			if (hasValidExtension(handle.name, type)) return handle;
			suggestion = ensureImageExtension(handle.name, type);
			window.alert(
				`The file must use the .${extension} extension. Save As will reopen with the corrected filename.`,
			);
		}
	}

	private async write(
		handle: FileSystemFileHandle,
		type: ImageFormat,
	): Promise<void> {
		const writable = await handle.createWritable();
		await writable.write(await this.documentModel.toBlob(type));
		await writable.close();
	}
}
