import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';
import {
	clampDimension,
	linkedDimension,
} from '../../core/geometry/geometryHelpers';
import { element } from '../../shared/dom/domHelpers';
import type { CanvasDocument } from '../../core/document/imageDocument';
import {
	DEFAULT_DOCUMENT_NAME,
	DocumentType,
	type NewImageOptions,
} from '../../core/document/appTypes';
import { ANIMATION_FILE_TYPE } from '../animation/format/animationFileFormat';
import { AnimationDefaults } from '../animation/animationTypes';
import { SVG_MIME_TYPE } from '../../core/document/svgFormat';
import {
	DEFAULT_IMAGE_FORMAT,
	isImageFormat,
} from '../../core/document/imageFormats';
import type { NewImageSpec } from '../assistant/assistantCommandTypes';
import { fileTypeOfName, isSavableFileName } from './openFileTypes';
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
/** The kind of document each file type in the dialog makes; an image format makes an image. */
const DOCUMENT_TYPE_OF_FILE_TYPE: Readonly<Record<string, DocumentType>> = {
	[SVG_MIME_TYPE]: DocumentType.Svg,
	[ANIMATION_FILE_TYPE]: DocumentType.Animation,
};
const HIDDEN_CLASS = 'hidden';
/** How the dialog is titled for what it makes. */
const DialogTitle = {
	Image: { title: 'New image', subtitle: 'Create a blank canvas' },
	Animation: { title: 'New animation', subtitle: 'Create a stage to animate on' },
} as const;

/** A new document as the dialog made it; an animation also has its frame rate. */
export interface NewDocumentOptions extends NewImageOptions {
	readonly fps?: number;
}
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
	/** The file type the dialog starts with, which New image comes back to. */
	#defaultFileType = '';
	readonly #fps = document.createElement('input');
	readonly #fpsField = document.createElement('label');
	readonly #createListeners = new Set<(options: NewDocumentOptions) => void>();

	constructor(readonly documentModel: CanvasDocument) {
		this.addDynamicControls();
		this.bindEvents();
	}

	/** Asks for the new image's size and background; a file name, when given, fills in its name and type. */
	open(fileName?: string): void {
		// New image makes an image; an animation is asked for with New animation, or by its file name.
		if (this.#format.value === ANIMATION_FILE_TYPE) this.chooseFileType(this.#defaultFileType);
		if (fileName) this.suggest(fileName);
		this.showDialog();
	}

	/** Asks for a new animation's stage: its size, background and frame rate. */
	openAnimation(): void {
		this.chooseFileType(ANIMATION_FILE_TYPE);
		this.showDialog();
	}

	private showDialog(): void {
		this.describeDocumentType();
		this.dialog.showModal();
	}

	private chooseFileType(fileType: string): void {
		this.#format.value = fileType;
		this.updateFileTypeWarning();
		this.updateTransparencyWarning();
	}

	/** Told about each document created, with the options it was made with. */
	onCreate(listener: (options: NewDocumentOptions) => void): void {
		this.#createListeners.add(listener);
	}

	private suggest(fileName: string): void {
		const extensionStart = fileName.lastIndexOf('.');
		this.#name.value = extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;
		if (isSavableFileName(fileName)) this.#format.value = fileTypeOfName(fileName);
		this.describeDocumentType();
		this.updateFileTypeWarning();
		this.updateTransparencyWarning();
	}

	private addDynamicControls(): void {
		element('#openButton').insertAdjacentHTML(
			'beforebegin',
			`<button id="newImageButton" role="menuitem"><span class="menu-action-copy">${editorIconMarkup(EditorIconId.NewImage)}New image…</span><kbd>Ctrl/⌘+N</kbd></button>`,
		);
		element('#newImageButton').insertAdjacentHTML(
			'afterend',
			`<button id="newAnimationButton" role="menuitem"><span class="menu-action-copy">${editorIconMarkup(EditorIconId.Timeline)}New animation…</span></button>`,
		);
		element('#quickOpenButton').insertAdjacentHTML(
			'beforebegin',
			`<button class="icon-button" id="quickNewButton" data-file-command title="New image (Ctrl/⌘ N)">${editorIconMarkup(EditorIconId.NewImage)}</button>` +
				`<button class="icon-button" id="quickNewAnimationButton" data-file-command title="New animation: layers, keyframes and tweens on a timeline" aria-label="New animation">${editorIconMarkup(EditorIconId.Timeline)}</button>`,
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
		this.#defaultFileType = this.#format.value;
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
		this.#resolution.closest('label')!.insertAdjacentElement('afterend', this.fpsField());
		this.describeDocumentType();
	}

	/** The frame rate an animation plays at, asked only when the dialog makes an animation. */
	private fpsField(): HTMLLabelElement {
		this.#fps.id = 'newAnimationFps';
		this.#fps.type = 'number';
		this.#fps.min = String(AnimationDefaults.MinimumFps);
		this.#fps.max = String(AnimationDefaults.MaximumFps);
		this.#fps.step = '1';
		this.#fps.value = String(AnimationDefaults.Fps);
		this.#fpsField.append('Frame rate (fps)', this.#fps);
		return this.#fpsField;
	}

	/** Titles the dialog for the kind of document it makes, and shows an animation's frame rate. */
	private describeDocumentType(): void {
		const animation = this.#format.value === ANIMATION_FILE_TYPE;
		const { title, subtitle } = animation ? DialogTitle.Animation : DialogTitle.Image;
		element('#newImageTitle').textContent = title;
		element('#newImageSubtitle').textContent = subtitle;
		this.#fpsField.classList.toggle(HIDDEN_CLASS, !animation);
	}

	private bindEvents(): void {
		element('#newImageButton').addEventListener('click', () => this.open());
		for (const selector of ['#newAnimationButton', '#quickNewAnimationButton']) element(selector).addEventListener('click', () => this.openAnimation());
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
			this.describeDocumentType();
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
		const documentType = DOCUMENT_TYPE_OF_FILE_TYPE[fileType] ?? DocumentType.Image;
		const created: NewDocumentOptions = {
			...options,
			format: isImageFormat(fileType)
				? fileType
				: DEFAULT_IMAGE_FORMAT.mimeType,
			documentType,
			...(documentType === DocumentType.Animation ? { fps: Number(this.#fps.value) || AnimationDefaults.Fps } : {}),
		};
		this.documentModel.create(created);
		this.#createListeners.forEach((listener) => listener(created));
	}

	private updateTransparencyWarning(): void {
		const warning = element('#transparencyWarning');
		const transparent = element<HTMLInputElement>(
			'#newImageTransparent',
		).checked;
		warning.textContent = isImageFormat(this.#format.value)
			? transparencyWarning(this.#format.value)
			: documentFileTypeWarning(this.#format.value);
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
