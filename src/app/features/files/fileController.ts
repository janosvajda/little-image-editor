import { EditorIconId, editorIconMarkup, presentEditorIcons } from '../../shared/style/editorIcons';
import { element } from '../../shared/dom/domHelpers';
import {
	ensureExtension,
	ensureImageExtension,
	hasValidExtension,
	preferredExtension,
} from './fileNameHelpers';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { ImageFormat } from '../../core/document/appTypes';
import { DocumentType } from '../../core/document/appTypes';
import { imageFormat, imageFormatOfFileName } from '../../core/document/imageFormats';
import { isSvgFile, isSvgFileName, SVG_EXTENSION, SVG_MIME_TYPE } from '../../core/document/svgFormat';
import type { ImageEncoding } from './canvasHelpers';
import type { ExportOptions } from './exportOptions';
import type { SvgDocumentOptions } from './svgExport';
import { ANIMATION_EXTENSION, animationBaseName, animationFileName, isAnimationFile, isAnimationFileName } from '../animation/format/animationFileFormat';
import { ANIMATION_EXPORT_FORMATS, type AnimationExportFormat, isAnimationExportFormat } from '../animation/export/animationExportFormats';

/** What a copy can be exported as: one of the image formats, SVG, or, for an animation, a GIF or a video. */
export type ExportFormat = ImageFormat | typeof SVG_MIME_TYPE | AnimationExportFormat;

/** What naming a file to save asks for, by what it holds. */
const SavePrompt = { Image: 'Save image as', Animation: 'Save animation as', Export: 'Export animation as' } as const;

/** A kind of file to choose: how a picker shows it, which names it takes, and how a name is put right. */
interface ChosenFileKind {
	readonly extension: string;
	/** What is asked for when the file is named rather than picked. */
	readonly prompt: string;
	readonly types: readonly PickerFileType[];
	accepts(name: string): boolean;
	named(name: string): string;
}

/** An SVG to save or export: only an SVG name will do. */
const SVG_FILE_KIND: ChosenFileKind = {
	extension: SVG_EXTENSION,
	prompt: SavePrompt.Image,
	types: [SVG_PICKER_TYPE],
	accepts: isSvgFileName,
	named: (name) => ensureExtension(name, SVG_EXTENSION),
};

/**
 * The document as SVG, which the editor gives the file controller: opening
 * an SVG as editable layers, writing the document as one, and whether some of
 * its items can only be pictures in it.
 */
export interface SvgDocumentPort {
	open(file: File, target: SaveTarget | null): Promise<void>;
	write(options?: SvgDocumentOptions): Blob;
}

/** An animation to save: only an animation file's name will do. */
const ANIMATION_FILE_KIND: ChosenFileKind = {
	extension: ANIMATION_EXTENSION,
	prompt: SavePrompt.Animation,
	types: [ANIMATION_PICKER_TYPE],
	accepts: isAnimationFileName,
	named: animationFileName,
};

/** An animation file written, and what it does not keep, each said as a question to continue. */
export interface AnimationDocumentWrite {
	readonly blob: Blob;
	readonly warnings: readonly string[];
}

/** The animation exported to play anywhere, which the editor gives the file controller. */
export interface AnimationExportPort {
	supports(format: AnimationExportFormat): boolean;
	export(format: AnimationExportFormat, options: ExportOptions): Promise<Blob>;
}

/** An exported animation's file: only a name of its format will do. */
function animationExportKind(format: AnimationExportFormat): ChosenFileKind {
	const { label, extension } = ANIMATION_EXPORT_FORMATS[format];
	const suffix = `.${extension}`;
	return {
		extension,
		prompt: SavePrompt.Export,
		types: [{ description: label, accept: { [format]: [suffix] } }],
		accepts: (name) => name.toLowerCase().endsWith(suffix),
		named: (name) => ensureExtension(name, extension),
	};
}

/** The document as an animation file, which the editor gives the file controller: opening one, and writing the animation as one. */
export interface AnimationDocumentPort {
	open(file: File, target: SaveTarget | null): Promise<void>;
	write(): Promise<AnimationDocumentWrite>;
}

function imageFileKind(format: ImageFormat, types: readonly PickerFileType[], accepts: (name: string) => boolean): ChosenFileKind {
	return { extension: preferredExtension(format), prompt: SavePrompt.Image, types, accepts, named: (name) => ensureImageExtension(name, format) };
}
import { isImageFileType } from './formatSelectHelpers';
import {
	EDITOR_OPEN_FILE_ACCEPT,
	EDITOR_OPEN_PICKER_TYPES,
	ANIMATION_PICKER_TYPE,
	imagePickerType,
	isSavableFileName,
	SVG_PICKER_TYPE,
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
/** How many files of the wrong kind Save As takes before it stops asking. */
const MAX_PICK_ATTEMPTS = 3;
const UNSAVABLE_FORMAT_MESSAGE =
	'Little Image Editor saves SVG documents and PNG, JPEG or WebP images. Use Save As to choose one of them.';
const OPEN_FAILED_MESSAGE = 'The file could not be opened as an image.';
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
	#svgDocument: SvgDocumentPort | null = null;
	#animationDocument: AnimationDocumentPort | null = null;
	#animationExporter: AnimationExportPort | null = null;
	/** Opens the Export dialog, where an edition has one, to choose how a copy is exported. */
	#exportDialog: (() => void) | null = null;

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
	 * Opens an image or an SVG document. Where the browser can pick files itself,
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
	/** The Export dialog: Export… opens it to choose a copy's format and settings. */
	setExportDialog(open: () => void): void {
		this.#exportDialog = open;
	}
	/** Reads and writes the document as SVG; the editor gives it the layers it draws. */
	setSvgDocument(svg: SvgDocumentPort): void {
		this.#svgDocument = svg;
	}
	/** Exports the animation as a GIF or a video. */
	setAnimationExporter(exporter: AnimationExportPort): void {
		this.#animationExporter = exporter;
	}
	/** Reads and writes animation files; the editor gives it the animation it keeps. */
	setAnimationDocument(animation: AnimationDocumentPort): void {
		this.#animationDocument = animation;
	}
	/** Opens a file the host owns; Save then writes back into it. */
	async openTarget(target: OpenTarget): Promise<void> {
		await this.openFile(await target.getFile(), target);
	}

	/**
	 * Opens a file however it came, picked, dropped or pasted: an SVG as its
	 * editable document, or an image. With a target, Save writes back into it.
	 */
	async openFile(file: File, target?: SaveTarget): Promise<void> {
		if (isAnimationFile(file) && this.#animationDocument) {
			await this.#animationDocument.open(file, target ?? null);
			return;
		}
		if (isSvgFile(file) && this.#svgDocument) {
			await this.#svgDocument.open(file, target ?? null);
			return;
		}
		if (isImageFileType(file.type)) this.documentModel.savedType = file.type;
		await this.documentModel.load(file);
		if (target) this.documentModel.fileHandle = target;
	}

	/**
	 * Saves the document into its SVG. A document without one, such as an
	 * image opened from a PNG, is saved as Save As saves it: pictures are made
	 * from it by Export, so its layers are never flattened by saving.
	 */
	async save(): Promise<void> {
		if (!this.documentModel.hasImage) return;
		const current = this.documentModel.fileHandle;
		if (current && this.documentKind().accepts(current.name)) await ignoringCancel(this.saveInto(current));
		else await this.saveAs();
	}

	/**
	 * Saves into a chosen file, by Save As or by a host such as VS Code, in
	 * the format its name says: SVG or an image format. Later saves write there
	 * too. A declined question rejects, so a host keeps the
	 * file marked unsaved.
	 */
	async saveInto(target: SaveTarget): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (!isSavableFileName(target.name)) {
			this.platform.dialogs.alert(UNSAVABLE_FORMAT_MESSAGE);
			throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
		}
		await this.saveByName(target);
	}

	/** Chooses the SVG to save the document into, which Save then keeps writing to. Pictures of it are made by Export. */
	async saveAs(): Promise<void> {
		if (!this.documentModel.hasImage) return;
		await ignoringCancel(this.saveChosen());
	}

	/**
	 * Exports a copy as an image or as SVG; the open document keeps its file,
	 * format and layers. Without a format, the Export dialog asks for one and
	 * its settings, where there is a dialog; otherwise the document's own is used.
	 */
	async exportImage(type?: ExportFormat, options?: ExportOptions): Promise<void> {
		if (!this.documentModel.hasImage) return;
		if (type === undefined && this.#exportDialog) {
			this.#exportDialog();
			return;
		}
		const format = type ?? this.documentModel.savedType;
		if (isAnimationExportFormat(format)) {
			await ignoringCancel(this.exportAnimation(format, options));
			return;
		}
		if (format === SVG_MIME_TYPE) {
			await ignoringCancel(this.exportSvg(options));
			return;
		}
		// Settings chosen in the dialog already say what shows behind transparent pixels.
		if (!options && !(await this.confirmTransparency(format))) return;
		await ignoringCancel(this.exportTo(format, options));
	}

	requestClose(): void {
		if (this.documentModel.hasImage) this.closeDialog.showModal();
	}

	closeWithoutSaving(): void {
		this.closeDialog.close();
		this.documentModel.close();
	}

	private async saveChosen(): Promise<void> {
		const target = await this.chooseTarget(this.documentKind());
		if (target) await this.saveByName(target);
	}

	/** The file an editable document is saved as: an animation file for an animation, otherwise an SVG. */
	private documentKind(): ChosenFileKind {
		return this.documentModel.documentType === DocumentType.Animation ? ANIMATION_FILE_KIND : SVG_FILE_KIND;
	}

	/**
	 * Saves into a file in the format its name says: an SVG keeps every layer
	 * and item, an image flattens them. Questions
	 * come once the file is chosen; a declined one cancels the save.
	 */
	private async saveByName(target: SaveTarget): Promise<void> {
		if (isAnimationFileName(target.name)) {
			await this.writeAnimationDocument(target);
			return;
		}
		if (isSvgFileName(target.name)) {
			await this.writeSvgDocument(target);
			return;
		}
		const type = imageFormatOfFileName(target.name)?.mimeType ?? this.documentModel.savedType;
		if (!(await this.canSaveRaster(type))) throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
		await this.writeDocument(target, type);
	}

	/** An image copy: the open document keeps its file, format and layers. */
	private async exportTo(type: ImageFormat, encoding?: ImageEncoding): Promise<void> {
		const target = await this.chooseTarget(imageFileKind(type, [imagePickerType(type)], (name) => hasValidExtension(name, type)));
		if (target) await this.write(target, imageFormatOfFileName(target.name)?.mimeType ?? type, encoding);
	}

	/** The animation as a GIF or a video; the file is chosen first, as making a video takes as long as the animation plays. */
	private async exportAnimation(format: AnimationExportFormat, options: ExportOptions = { scale: 1 }): Promise<void> {
		const exporter = this.#animationExporter;
		if (!exporter?.supports(format)) return;
		const target = await this.chooseTarget(animationExportKind(format));
		if (target) await writeToTarget(target, await exporter.export(format, options));
	}

	private async exportSvg(options?: SvgDocumentOptions): Promise<void> {
		const svg = this.#svgDocument;
		if (!svg) return;
		const target = await this.chooseTarget(SVG_FILE_KIND);
		if (target) await writeToTarget(target, svg.write(options));
	}

	/** Writes the document into an SVG file, which Save then keeps writing to; a download is not kept. */
	private async writeSvgDocument(target: SaveTarget): Promise<void> {
		const svg = this.#svgDocument;
		if (!svg) throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
		this.prepareDocumentForSave();
		await writeToTarget(target, svg.write());
		this.keepEditableFile(target, DocumentType.Svg, target.name.replace(/\.[^.]+$/, ''));
	}

	/**
	 * Writes the document into an animation file, which Save then keeps writing
	 * to. What the file will not keep is asked about first; declining cancels.
	 */
	private async writeAnimationDocument(target: SaveTarget): Promise<void> {
		const animation = this.#animationDocument;
		if (!animation) throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
		this.prepareDocumentForSave();
		const { blob, warnings } = await animation.write();
		for (const warning of warnings) if (!(await this.platform.dialogs.confirm(warning))) throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
		await writeToTarget(target, blob);
		this.keepEditableFile(target, DocumentType.Animation, animationBaseName(target.name));
	}

	/** Makes a written file the one Save writes to, as the kind of document it holds; a download is not kept. */
	private keepEditableFile(target: SaveTarget, documentType: DocumentType, baseName: string): void {
		if (this.#downloads.has(target)) return;
		this.documentModel.fileHandle = target;
		this.documentModel.documentType = documentType;
		this.documentModel.baseName = baseName || this.documentModel.baseName;
	}

	/** A file of a kind: chosen in a picker where the browser has one, otherwise named and downloaded. */
	private chooseTarget(kind: ChosenFileKind): Promise<SaveTarget | null> {
		return this.platform.files.canPickSaveTarget() ? this.pickTarget(kind) : this.promptedDownload(kind);
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
	private async promptedDownload(kind: ChosenFileKind): Promise<SaveTarget | null> {
		const requested = await this.platform.dialogs.prompt(kind.prompt, kind.named(this.documentModel.baseName));
		if (!requested) return null;
		const name = kind.accepts(requested) ? requested.trim() : kind.named(requested);
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
			void this.openFile(file)
				.catch(() => this.platform.dialogs.alert(OPEN_FAILED_MESSAGE))
				.finally(() => {
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

	/**
	 * Asks for a file until its name is one `accepts`, reopening with the name
	 * corrected; after a few names of the wrong kind it stops asking, as if cancelled.
	 */
	private async pickTarget(kind: ChosenFileKind): Promise<SaveTarget> {
		let suggestion = kind.named(this.documentModel.baseName);
		for (let attempt = 1; attempt <= MAX_PICK_ATTEMPTS; attempt++) {
			const target = await this.platform.files.pickSaveTarget({ suggestedName: suggestion, types: kind.types });
			if (kind.accepts(target.name)) return target;
			suggestion = kind.named(target.name);
			this.platform.dialogs.alert(
				attempt < MAX_PICK_ATTEMPTS
					? `The file must use the .${kind.extension} extension. Save As will reopen with the corrected filename.`
					: `The file must use the .${kind.extension} extension, so nothing was saved.`,
			);
		}
		throw new DOMException(SAVE_CANCELLED_MESSAGE, ABORT_ERROR_NAME);
	}

	/** Writes the image into a file: as the format writes by default, or with an export's own settings. */
	private async write(target: SaveTarget, type: ImageFormat, encoding?: ImageEncoding): Promise<void> {
		await writeToTarget(target, await (encoding ? this.documentModel.toBlob(type, encoding) : this.documentModel.toBlob(type)));
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
