import {
	clampDimension,
	linkedDimension,
} from '../../core/geometry/geometryHelpers';
import { element } from '../../shared/dom/domHelpers';
import type { CanvasDocument } from '../../core/document/imageDocument';
import {
	DEFAULT_DOCUMENT_NAME,
	DocumentType,
} from '../../core/document/appTypes';
import { PROJECT_MIME_TYPE } from '../projects/projectTypes';
import {
	DEFAULT_IMAGE_FORMAT,
	imageFormat,
	imageFormatOfFileName,
	isImageFormat,
} from '../../core/document/imageFormats';
import type { NewImageSpec } from '../assistant/assistantCommandTypes';
import { isProjectFileName } from './openFileTypes';
import {
	documentFileTypeWarning,
	populateDocumentFileTypeSelect,
	transparencyWarning,
} from './formatSelectHelpers';

const ResolutionPpi = {
	Web: 72,
	Screen: 96,
	HiDpi: 144,
	PrintDraft: 150,
	PrintHigh: 240,
	Print: 300,
	PrintFine: 600,
	PrintUltra: 1_200,
} as const;
const RESOLUTION_PRESETS = Object.values(ResolutionPpi);
const PresetId = { Custom: 'custom' } as const;
const AspectRatioId = { Free: 'free' } as const;
const DimensionAxis = { Width: 'width', Height: 'height' } as const;
type DimensionAxis = (typeof DimensionAxis)[keyof typeof DimensionAxis];
const PRINT_PRESETS = [
	{
		label: '3508 × 4961 — A3 at 300 DPI',
		value: '3508x4961',
		position: 'first',
	},
	{
		label: '1748 × 2480 — A5 at 300 DPI',
		value: '1748x2480',
		position: 'last',
	},
] as const;

export class NewImageController {
	readonly dialog = element<HTMLDialogElement>('#newImageDialog');
	readonly #preset = element<HTMLSelectElement>('#newImagePreset');
	readonly #aspect = element<HTMLSelectElement>('#newImageAspect');
	readonly #width = element<HTMLInputElement>('#newImageWidth');
	readonly #height = element<HTMLInputElement>('#newImageHeight');
	readonly #name = element<HTMLInputElement>('#newImageName');
	readonly #resolution = document.createElement('select');
	#format!: HTMLSelectElement;
	#fileTypeWarning!: HTMLElement;
	readonly #createListeners = new Set<() => void>();

	constructor(readonly documentModel: CanvasDocument) {
		this.addDynamicControls();
		this.bindEvents();
	}

	/** Asks for the new image's size and background; a file name, when given, fills in its name and type. */
	open(fileName?: string): void {
		if (fileName) this.suggest(fileName);
		this.dialog.showModal();
	}

	onCreate(listener: () => void): void {
		this.#createListeners.add(listener);
	}

	private suggest(fileName: string): void {
		const extensionStart = fileName.lastIndexOf('.');
		this.#name.value = extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;
		const type = isProjectFileName(fileName)
			? PROJECT_MIME_TYPE
			: imageFormatOfFileName(fileName)?.mimeType;
		if (type) this.#format.value = type;
		this.updateFileTypeWarning();
		this.updateTransparencyWarning();
	}

	private addDynamicControls(): void {
		element('#openButton').insertAdjacentHTML(
			'beforebegin',
			'<button id="newImageButton" role="menuitem"><span>New image…</span><kbd>Ctrl/⌘+N</kbd></button>',
		);
		element('#quickOpenButton').insertAdjacentHTML(
			'beforebegin',
			'<button class="icon-button" id="quickNewButton" data-file-command title="New image (Ctrl/⌘ N)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>',
		);
		const print = document.querySelector<HTMLOptGroupElement>(
			'#newImagePreset optgroup[label="Print"]',
		)!;
		for (const preset of PRINT_PRESETS) {
			const option = new Option(preset.label, preset.value);
			if (preset.position === 'first')
				print.insertBefore(option, print.firstChild);
			else print.append(option);
		}
		this.#name.closest('label')!.insertAdjacentHTML(
			'afterend',
			'<label>File type<select id="newImageFormat"></select></label><p id="newImageFileTypeWarning" class="file-format-warning" role="status"></p>',
		);
		this.#format = element<HTMLSelectElement>('#newImageFormat');
		populateDocumentFileTypeSelect(this.#format);
		this.#fileTypeWarning = element('#newImageFileTypeWarning');
		this.updateFileTypeWarning();
		this.#resolution.id = 'newImageResolution';
		this.#resolution.setAttribute('aria-label', 'Resolution (PPI)');
		for (const ppi of RESOLUTION_PRESETS) {
			this.#resolution.append(
				new Option(
					`${ppi} PPI`,
					String(ppi),
					false,
					ppi === ResolutionPpi.Screen,
				),
			);
		}
		this.#format
			.closest('label')!
			.insertAdjacentElement('afterend', this.resolutionField());
		print.querySelectorAll('option').forEach((option) => {
			option.dataset.resolution = String(ResolutionPpi.Print);
		});
	}

	private bindEvents(): void {
		element('#newImageButton').addEventListener('click', () => this.open());
		element('#quickNewButton').addEventListener('click', () => this.open());
		element('#createImageButton').addEventListener('click', () =>
			this.create(),
		);
		this.#preset.addEventListener('change', () => {
			if (this.#preset.value === PresetId.Custom) return;
			const [width, height] = this.#preset.value.split('x');
			this.#width.value = width!;
			this.#height.value = height!;
			this.#aspect.value = AspectRatioId.Free;
			this.#resolution.value =
				this.#preset.selectedOptions[0]?.dataset.resolution ??
				String(ResolutionPpi.Screen);
		});
		this.#width.addEventListener('input', () =>
			this.updateLinkedDimension(DimensionAxis.Width),
		);
		this.#height.addEventListener('input', () =>
			this.updateLinkedDimension(DimensionAxis.Height),
		);
		this.#aspect.addEventListener('change', () =>
			this.updateLinkedDimension(DimensionAxis.Width),
		);
		this.#format.addEventListener('change', () => {
			this.updateFileTypeWarning();
			this.updateTransparencyWarning();
		});
		element<HTMLInputElement>('#newImageTransparent').addEventListener(
			'change',
			(event) => {
				const transparent = (event.currentTarget as HTMLInputElement).checked;
				element<HTMLInputElement>('#newImageColor').disabled = transparent;
				this.updateTransparencyWarning();
			},
		);
	}

	private updateLinkedDimension(source: DimensionAxis): void {
		this.#preset.value = PresetId.Custom;
		const ratio =
			this.#aspect.value === AspectRatioId.Free
				? null
				: Number(this.#aspect.value);
		if (!ratio || !Number.isFinite(ratio)) return;
		if (source === DimensionAxis.Width && Number(this.#width.value) > 0)
			this.#height.value = String(
				linkedDimension(this.#width.value, ratio, source),
			);
		if (source === DimensionAxis.Height && Number(this.#height.value) > 0)
			this.#width.value = String(
				linkedDimension(this.#height.value, ratio, source),
			);
	}

	/** Creates an image without asking, for a file a host opened on an assistant's request. */
	createImage(fileName: string, spec: NewImageSpec): void {
		const width = clampDimension(String(spec.width)),
			height = clampDimension(String(spec.height));
		if (!Number.isFinite(width) || !Number.isFinite(height)) return;
		this.suggest(fileName);
		this.createDocument({
			name: this.#name.value || DEFAULT_DOCUMENT_NAME,
			width,
			height,
			transparent: spec.transparent,
			background: spec.background,
			resolution: ResolutionPpi.Screen,
		});
	}

	private create(): void {
		const width = clampDimension(this.#width.value),
			height = clampDimension(this.#height.value);
		if (!Number.isFinite(width) || !Number.isFinite(height)) return;
		this.createDocument({
			name: this.#name.value.trim() || DEFAULT_DOCUMENT_NAME,
			width,
			height,
			transparent: element<HTMLInputElement>('#newImageTransparent').checked,
			background: element<HTMLInputElement>('#newImageColor').value,
			resolution: Number(this.#resolution.value),
		});
		this.dialog.close();
	}

	/** Creates the document in the file type chosen in the dialog, then tells the listeners. */
	private createDocument(
		options: Readonly<{
			name: string;
			width: number;
			height: number;
			transparent: boolean;
			background: string;
			resolution: number;
		}>,
	): void {
		const fileType = this.#format.value;
		this.documentModel.create({
			...options,
			format: isImageFormat(fileType)
				? fileType
				: DEFAULT_IMAGE_FORMAT.mimeType,
			documentType:
				fileType === PROJECT_MIME_TYPE
					? DocumentType.Project
					: DocumentType.Image,
		});
		this.#createListeners.forEach((listener) => listener());
	}

	private updateTransparencyWarning(): void {
		const warning = element('#transparencyWarning');
		const transparent = element<HTMLInputElement>(
			'#newImageTransparent',
		).checked;
		warning.textContent =
			this.#format.value === PROJECT_MIME_TYPE
				? documentFileTypeWarning(PROJECT_MIME_TYPE)
				: transparencyWarning(imageFormat(this.#format.value).mimeType);
		warning.classList.toggle('hidden', !transparent);
	}

	private updateFileTypeWarning(): void {
		this.#fileTypeWarning.textContent = documentFileTypeWarning(
			this.#format.value,
		);
	}

	private resolutionField(): HTMLLabelElement {
		const label = document.createElement('label');
		label.append('Resolution (PPI)', this.#resolution);
		return label;
	}
}
