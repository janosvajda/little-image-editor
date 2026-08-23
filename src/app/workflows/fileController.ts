import { element } from "../helpers/domHelpers";
import { ensureImageExtension, hasValidExtension, preferredExtension } from "../helpers/fileNameHelpers";
import { CanvasDocument } from "../models/imageDocument";
import type { ImageFormat } from "../models/appTypes";
import { imageFormat } from "../models/imageFormats";
import { populateImageFormatSelect } from "../ui/formatSelectHelpers";

type PickerWindow = Window & { showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle> };

export class FileController {
  readonly fileInput = element<HTMLInputElement>("#fileInput");
  readonly #format = element<HTMLSelectElement>("#formatSelect");
  readonly #saveButtons: HTMLButtonElement[];

  constructor(readonly documentModel: CanvasDocument) {
    this.fileInput.accept = "image/png,image/jpeg,image/webp";
    element("#saveAsButton").insertAdjacentHTML("afterend", '<div class="menu-rule"></div><button id="exportButton" role="menuitem" disabled><span>Export…</span></button>');
    element("#exportButton").insertAdjacentHTML("afterend", '<div class="menu-rule"></div><button id="closeImageButton" role="menuitem" disabled><span>Close image</span></button>');
    populateImageFormatSelect(this.#format);
    this.#saveButtons = [element<HTMLButtonElement>("#saveButton"), element<HTMLButtonElement>("#saveAsButton"), element<HTMLButtonElement>("#exportButton"), element<HTMLButtonElement>("#quickSaveButton"), element<HTMLButtonElement>("#closeImageButton")];
    this.documentModel.onDocumentChange(({ hasImage }) => this.#saveButtons.forEach(button => { button.disabled = !hasImage; }));
    this.bindEvents();
  }

  open(): void { this.fileInput.click(); }

  async save(): Promise<void> {
    if (!this.documentModel.hasImage) return;
    if (!this.documentModel.fileHandle) { await this.saveAs(); return; }
    if (!this.confirmTransparency(this.documentModel.savedType)) return;
    await this.write(this.documentModel.fileHandle, this.documentModel.savedType);
  }

  async saveAs(): Promise<void> {
    await this.saveCopy(true);
  }

  async exportImage(): Promise<void> {
    await this.saveCopy(false);
  }

  private async saveCopy(updateDocument: boolean): Promise<void> {
    if (!this.documentModel.hasImage) return;
    const type = this.#format.value as ImageFormat;
    if (!this.confirmTransparency(type)) return;
    const extension = preferredExtension(type);
    try {
      const picker = (window as PickerWindow).showSaveFilePicker;
      if (picker) {
        const handle = await this.pickHandle(picker, ensureImageExtension(this.documentModel.baseName, type), type);
        await this.write(handle, type);
        if (updateDocument) {
          this.documentModel.fileHandle = handle;
          this.documentModel.savedType = type;
          this.documentModel.baseName = handle.name.replace(/\.[^.]+$/, "") || this.documentModel.baseName;
        }
        return;
      }
      const requestedName = window.prompt("Save image as", ensureImageExtension(this.documentModel.baseName, type));
      const filename = requestedName ? ensureImageExtension(requestedName, type) : null;
      if (!filename) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await this.documentModel.toBlob(type));
      link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  }

  private bindEvents(): void {
    ["#openButton", "#quickOpenButton", "#emptyOpenButton"].forEach(selector => element(selector).addEventListener("click", () => this.open()));
    this.fileInput.addEventListener("change", () => {
      const file = this.fileInput.files?.[0];
      if (!file) return;
      void this.documentModel.load(file).finally(() => { this.fileInput.value = ""; });
    });
    element("#saveButton").addEventListener("click", () => void this.save());
    element("#saveAsButton").addEventListener("click", () => void this.saveAs());
    element("#exportButton").addEventListener("click", () => void this.exportImage());
    element("#closeImageButton").addEventListener("click", () => this.documentModel.close());
    element("#quickSaveButton").addEventListener("click", () => void this.save());
  }

  private confirmTransparency(type: ImageFormat): boolean {
    const format = imageFormat(type);
    return format.supportsTransparency || !this.documentModel.containsTransparency() || window.confirm(`${format.label} does not support transparency. Transparent pixels will be replaced with white. Continue?`);
  }

  private async pickHandle(picker: NonNullable<PickerWindow["showSaveFilePicker"]>, suggestedName: string, type: ImageFormat): Promise<FileSystemFileHandle> {
    let suggestion = suggestedName;
    for (;;) {
      const format = imageFormat(type);
      const extension = format.extensions[0]!;
      const handle = await picker({ suggestedName: suggestion, types: [{ description: `${format.label} image`, accept: { [type]: format.extensions.map(value => `.${value}`) } }] });
      if (hasValidExtension(handle.name, type)) return handle;
      suggestion = ensureImageExtension(handle.name, type);
      window.alert(`The file must use the .${extension} extension. Save As will reopen with the corrected filename.`);
    }
  }

  private async write(handle: FileSystemFileHandle, type: ImageFormat): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(await this.documentModel.toBlob(type));
    await writable.close();
  }
}
