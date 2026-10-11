import { ImageMimeType } from '../../core/document/appTypes';
import { imageFormat, isImageFormat } from '../../core/document/imageFormats';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { element } from '../../shared/dom/domHelpers';
import { SVG_MIME_TYPE } from '../../core/document/svgFormat';
import { encodedSize } from './canvasHelpers';
import { DEFAULT_EXPORT_QUALITY, EXPORT_SCALES, type ExportOptions, ExportQualityPercent, ExportScale, PERCENT } from './exportOptions';
import type { ExportFormat, FileController, SvgDocumentPort } from './fileController';
import { populateImageFormatSelect } from './formatSelectHelpers';
import { imagePicture } from './imagePicture';

const PREVIEW_MAX_SIZE = 320;
const SVG_LABEL = 'SVG';
const SVG_HINT = 'SVG keeps shapes, paths, gradients and text as vectors; the photo, brush strokes and other pixels are embedded as images.';
/** An estimate waits until settings stop changing, so dragging a slider does not encode the image at every step. */
const ESTIMATE_DELAY_MS = 250;
const BYTES_PER_KILOBYTE = 1024;
const SIZE_UNITS = ['bytes', 'KB', 'MB', 'GB'] as const;
const SIZE_DECIMALS = 1;

/** The settings an export can have; each format shows its own. */
const ExportOption = {
	Quality: 'quality',
	Transparency: 'transparency',
	Background: 'background',
	IncludeImage: 'includeImage',
} as const;
type ExportOption = (typeof ExportOption)[keyof typeof ExportOption];

/** Which settings each format has: compression for lossy formats, transparency where it is kept, and SVG's image layer. */
const FORMAT_OPTIONS: Readonly<Record<ExportFormat, readonly ExportOption[]>> = {
	[ImageMimeType.Png]: [ExportOption.Transparency, ExportOption.Background],
	[ImageMimeType.Jpeg]: [ExportOption.Quality, ExportOption.Background],
	[ImageMimeType.Webp]: [ExportOption.Quality, ExportOption.Transparency, ExportOption.Background],
	[SVG_MIME_TYPE]: [ExportOption.IncludeImage],
};

/**
 * The Export dialog, in every edition: a copy's format, its size, and its
 * format's settings, with a preview and the file size it will have. The
 * document itself keeps its file, format and layers.
 */
export class ImageExportController {
	readonly dialog = element<HTMLDialogElement>('#exportImageDialog');
	readonly #button = element<HTMLButtonElement>('#quickExportButton');
	readonly #format = element<HTMLSelectElement>('#exportImageFormat');
	readonly #scale = element<HTMLSelectElement>('#exportImageScale');
	readonly #quality = element<HTMLInputElement>('#exportImageQuality');
	readonly #qualityValue = element<HTMLOutputElement>('#exportImageQualityValue');
	readonly #transparent = element<HTMLInputElement>('#exportImageTransparent');
	readonly #background = element<HTMLInputElement>('#exportImageBackground');
	readonly #includeImage = element<HTMLInputElement>('#exportImageIncludeImage');
	readonly #estimate = element<HTMLElement>('#exportImageEstimate');
	readonly #submit = element<HTMLButtonElement>('#confirmExportImageButton');
	readonly #preview = element<HTMLImageElement>('#exportImagePreview');
	readonly #error = element<HTMLElement>('#exportImageError');
	#previewUrl: string | null = null;
	#previewRequest = 0;
	#estimateRequest = 0;
	#estimateTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly files: Pick<FileController, 'exportImage'>,
		/** Writes the SVG an export would make, so its size can be estimated. */
		private readonly svg?: Pick<SvgDocumentPort, 'write'>,
	) {
		populateImageFormatSelect(this.#format, ImageMimeType.Png);
		// Vector output for the same picture, after the image formats.
		this.#format.add(new Option(SVG_LABEL, SVG_MIME_TYPE));
		this.#quality.min = String(ExportQualityPercent.Minimum);
		this.#quality.max = String(ExportQualityPercent.Maximum);
		this.#quality.value = String(Math.round(DEFAULT_EXPORT_QUALITY * PERCENT));
		this.#button.addEventListener('click', () => this.open());
		this.#format.addEventListener('change', () => this.describeFormat());
		for (const control of [this.#scale, this.#quality, this.#transparent, this.#background, this.#includeImage])
			control.addEventListener('input', () => this.describeFormat());
		this.dialog.querySelector('form')!.addEventListener('submit', (event) => {
			if ((event as SubmitEvent).submitter !== this.#submit) return;
			event.preventDefault();
			void this.export();
		});
		this.dialog.addEventListener('close', () => {
			clearTimeout(this.#estimateTimer);
			this.clearPreview();
		});
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
		this.describeScales();
		this.describeFormat();
		this.dialog.showModal();
		void this.showPreview();
	}

	/** Each size with the pixels it makes, the original chosen when the dialog opens. */
	private describeScales(): void {
		const { width, height } = this.documentModel;
		this.#scale.replaceChildren(
			...EXPORT_SCALES.map((scale) => {
				const size = encodedSize(width, height, scale);
				return new Option(`${Math.round(scale * PERCENT)}% · ${size.width} × ${size.height} px`, String(scale), false, scale === ExportScale.Original);
			}),
		);
	}

	/** Shows the chosen format's settings and hint, and how big the file will be. */
	private describeFormat(): void {
		const format = this.chosenFormat();
		const options = FORMAT_OPTIONS[format];
		const keepsTransparency = options.includes(ExportOption.Transparency) && this.#transparent.checked;
		for (const row of this.dialog.querySelectorAll<HTMLElement>('[data-export-option]')) {
			const option = row.dataset.exportOption as ExportOption;
			const shown = options.includes(option) && !(option === ExportOption.Background && keepsTransparency);
			row.classList.toggle('hidden', !shown);
		}
		this.#qualityValue.value = `${this.#quality.value}%`;
		element('#exportImageFormatHint').textContent = formatHint(format);
		this.#submit.textContent = `Export ${format === SVG_MIME_TYPE ? SVG_LABEL : imageFormat(format).label}…`;
		this.scheduleEstimate();
	}

	private chosenFormat(): ExportFormat {
		const format = this.#format.value;
		return isImageFormat(format) || format === SVG_MIME_TYPE ? format : ImageMimeType.Png;
	}

	/** The chosen settings, only those the format has. */
	private options(format: ExportFormat): ExportOptions {
		const scale = Number(this.#scale.value) || ExportScale.Original;
		const options = FORMAT_OPTIONS[format];
		if (format === SVG_MIME_TYPE) return { scale, includeImage: this.#includeImage.checked };
		const keepsTransparency = options.includes(ExportOption.Transparency) && this.#transparent.checked;
		return {
			scale,
			...(options.includes(ExportOption.Quality) ? { quality: Number(this.#quality.value) / PERCENT } : {}),
			...(keepsTransparency ? {} : { background: this.#background.value }),
		};
	}

	private scheduleEstimate(): void {
		clearTimeout(this.#estimateTimer);
		const request = ++this.#estimateRequest;
		this.#estimate.textContent = '';
		this.#estimateTimer = setTimeout(() => void this.estimate(request), ESTIMATE_DELAY_MS);
	}

	/** Writes the export as it would be, to say how big its file will be. */
	private async estimate(request: number): Promise<void> {
		if (!this.dialog.open) return;
		const format = this.chosenFormat();
		const options = this.options(format);
		try {
			const blob = format === SVG_MIME_TYPE ? this.svg?.write(options) : await this.documentModel.toBlob(format, options);
			if (blob && request === this.#estimateRequest && this.dialog.open) this.#estimate.textContent = `Estimated file size: ${fileSize(blob.size)}`;
		} catch {
			// An estimate is optional; exporting still reports any encoding error.
		}
	}

	private async export(): Promise<void> {
		const format = this.#format.value;
		if (this.#submit.disabled || !(isImageFormat(format) || format === SVG_MIME_TYPE)) return;
		this.#submit.disabled = true;
		this.#format.disabled = true;
		this.#error.textContent = '';
		try {
			await this.files.exportImage(format, this.options(format));
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

/** What a format keeps, said where it is chosen. */
function formatHint(format: ExportFormat): string {
	if (format === SVG_MIME_TYPE) return SVG_HINT;
	const { label, supportsTransparency, quality } = imageFormat(format);
	const compression = quality === undefined ? `${label} is lossless.` : `${label} is compressed; a lower quality makes a smaller file.`;
	const transparency = supportsTransparency
		? `It can keep transparent areas, or fill them with a colour.`
		: `${label} does not support transparency; transparent areas are filled with the background colour.`;
	return `${compression} ${transparency}`;
}

/** A file size as people read one. */
function fileSize(bytes: number): string {
	let size = bytes;
	let unit = 0;
	while (size >= BYTES_PER_KILOBYTE && unit < SIZE_UNITS.length - 1) {
		size /= BYTES_PER_KILOBYTE;
		unit++;
	}
	return `${unit === 0 ? size : size.toFixed(SIZE_DECIMALS)} ${SIZE_UNITS[unit]}`;
}
