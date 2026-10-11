import { ImageMimeType } from '../../core/document/appTypes';
import { imageFormat, isImageFormat } from '../../core/document/imageFormats';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { element } from '../../shared/dom/domHelpers';
import type { FileController } from './fileController';
import { populateImageFormatSelect, transparencyWarning } from './formatSelectHelpers';
import { imagePicture } from './imagePicture';

const PREVIEW_MAX_SIZE = 320;

/** Export controls share the file controller's encoder and platform save picker. */
export class ImageExportController {
	readonly dialog = element<HTMLDialogElement>('#exportImageDialog');
	readonly #button = element<HTMLButtonElement>('#quickExportButton');
	readonly #format = element<HTMLSelectElement>('#exportImageFormat');
	readonly #submit = element<HTMLButtonElement>('#confirmExportImageButton');
	readonly #preview = element<HTMLImageElement>('#exportImagePreview');
	readonly #error = element<HTMLElement>('#exportImageError');
	#previewUrl: string | null = null;
	#previewRequest = 0;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly files: Pick<FileController, 'exportImage'>,
	) {
		populateImageFormatSelect(this.#format, ImageMimeType.Png);
		this.#button.addEventListener('click', () => this.open());
		this.#format.addEventListener('change', () => this.describeFormat());
		this.dialog.querySelector('form')!.addEventListener('submit', (event) => {
			if ((event as SubmitEvent).submitter !== this.#submit) return;
			event.preventDefault();
			void this.export();
		});
		this.dialog.addEventListener('close', () => this.clearPreview());
		this.documentModel.onDocumentChange(({ hasImage }) => {
			this.#button.disabled = !hasImage;
			if (!hasImage && this.dialog.open) this.dialog.close();
		});
		this.#button.disabled = !this.documentModel.hasImage;
	}

	open(): void {
		if (!this.documentModel.hasImage) return;
		this.#error.textContent = '';
		element('#exportImageDimensions').textContent =
			`${this.documentModel.width} × ${this.documentModel.height} px · Original size`;
		this.describeFormat();
		this.dialog.showModal();
		void this.showPreview();
	}

	private describeFormat(): void {
		element('#exportImageFormatHint').textContent = transparencyWarning(this.#format.value);
		this.#submit.textContent = `Export ${imageFormat(this.#format.value).label}…`;
	}

	private async export(): Promise<void> {
		const format = this.#format.value;
		if (this.#submit.disabled || !isImageFormat(format)) return;
		this.#submit.disabled = true;
		this.#format.disabled = true;
		this.#error.textContent = '';
		try {
			await this.files.exportImage(format);
			this.dialog.close();
		} catch (error) {
			this.#error.textContent = error instanceof Error ? error.message : String(error);
		} finally {
			this.#submit.disabled = false;
			this.#format.disabled = false;
		}
	}

	private async showPreview(): Promise<void> {
		this.clearPreview();
		const request = this.#previewRequest;
		try {
			const picture = await imagePicture(this.documentModel, PREVIEW_MAX_SIZE);
			if (request !== this.#previewRequest || !this.dialog.open) return;
			this.#previewUrl = URL.createObjectURL(picture.png);
			this.#preview.src = this.#previewUrl;
		} catch {
			// A preview is optional; exporting still reports any encoding error.
		}
	}

	private clearPreview(): void {
		this.#previewRequest++;
		if (this.#previewUrl) URL.revokeObjectURL(this.#previewUrl);
		this.#previewUrl = null;
		this.#preview.removeAttribute('src');
	}
}
