import { element } from "../helpers/domHelpers.js";
import { CanvasDocument } from "../models/imageDocument.js";
import type { ImageFormat } from "../models/appTypes.js";

type PickerWindow = Window & { showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle> };

export class FileController {
  readonly fileInput = element<HTMLInputElement>("#fileInput");
  readonly #format = element<HTMLSelectElement>("#formatSelect");
  readonly #saveButtons = [element<HTMLButtonElement>("#saveButton"), element<HTMLButtonElement>("#saveAsButton"), element<HTMLButtonElement>("#quickSaveButton")];

  constructor(readonly documentModel: CanvasDocument) {
    this.documentModel.onDocumentChange(({ hasImage }) => this.#saveButtons.forEach(button => { button.disabled = !hasImage; }));
    this.bindEvents();
  }

  open(): void { this.fileInput.click(); }

  async save(): Promise<void> {
    if (!this.documentModel.hasImage) return;
    if (!this.documentModel.fileHandle) { await this.saveAs(); return; }
    if (!this.confirmJpegTransparency(this.documentModel.savedType)) return;
    await this.write(this.documentModel.fileHandle, this.documentModel.savedType);
  }

  async saveAs(): Promise<void> {
    if (!this.documentModel.hasImage) return;
    const type = this.#format.value as ImageFormat;
    if (!this.confirmJpegTransparency(type)) return;
    const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1]!;
    try {
      const picker = (window as PickerWindow).showSaveFilePicker;
      if (picker) {
        const handle = await picker({ suggestedName: `${this.documentModel.baseName}.${extension}`, types: [{ description: `${extension.toUpperCase()} image`, accept: { [type]: [`.${extension}`] } }] });
        await this.write(handle, type);
        this.documentModel.fileHandle = handle;
        this.documentModel.savedType = type;
        this.documentModel.baseName = handle.name.replace(/\.[^.]+$/, "") || this.documentModel.baseName;
        return;
      }
      const filename = window.prompt("Save image as", `${this.documentModel.baseName}.${extension}`);
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
    this.fileInput.addEventListener("change", () => { const file = this.fileInput.files?.[0]; if (file) void this.documentModel.load(file); });
    element("#saveButton").addEventListener("click", () => void this.save());
    element("#saveAsButton").addEventListener("click", () => void this.saveAs());
    element("#quickSaveButton").addEventListener("click", () => void this.save());
  }

  private confirmJpegTransparency(type: ImageFormat): boolean {
    return type !== "image/jpeg" || !this.documentModel.containsTransparency() || window.confirm("JPEG does not support transparency. Transparent pixels will be replaced with white. Continue saving?");
  }

  private async write(handle: FileSystemFileHandle, type: ImageFormat): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(await this.documentModel.toBlob(type));
    await writable.close();
  }
}
