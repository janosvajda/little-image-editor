import { clampDimension, linkedDimension } from "../helpers/geometryHelpers";
import { element } from "../helpers/domHelpers";
import { CanvasDocument } from "../models/imageDocument";
import { imageFormat } from "../models/imageFormats";
import { populateImageFormatSelect, transparencyWarning } from "./formatSelectHelpers";

export class NewImageController {
  readonly dialog = element<HTMLDialogElement>("#newImageDialog");
  readonly #preset = element<HTMLSelectElement>("#newImagePreset");
  readonly #aspect = element<HTMLSelectElement>("#newImageAspect");
  readonly #width = element<HTMLInputElement>("#newImageWidth");
  readonly #height = element<HTMLInputElement>("#newImageHeight");
  #format!: HTMLSelectElement;

  constructor(readonly documentModel: CanvasDocument) {
    this.addDynamicControls();
    this.bindEvents();
  }

  open(): void { this.dialog.showModal(); }

  private addDynamicControls(): void {
    element("#openButton").insertAdjacentHTML("beforebegin", '<button id="newImageButton" role="menuitem"><span>New image…</span><kbd>Ctrl/⌘+N</kbd></button>');
    element("#quickOpenButton").insertAdjacentHTML("beforebegin", '<button class="icon-button" id="quickNewButton" title="New image (Ctrl/⌘ N)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>');
    const print = document.querySelector<HTMLOptGroupElement>('#newImagePreset optgroup[label="Print"]')!;
    print.insertBefore(new Option("3508 × 4961 — A3 at 300 DPI", "3508x4961"), print.firstChild);
    print.append(new Option("1748 × 2480 — A5 at 300 DPI", "1748x2480"));
    element<HTMLInputElement>("#newImageName").closest("label")!.insertAdjacentHTML("afterend", '<label>File type<select id="newImageFormat"></select></label>');
    this.#format = element<HTMLSelectElement>("#newImageFormat");
    populateImageFormatSelect(this.#format);
  }

  private bindEvents(): void {
    element("#newImageButton").addEventListener("click", () => this.open());
    element("#quickNewButton").addEventListener("click", () => this.open());
    element("#createImageButton").addEventListener("click", () => this.create());
    this.#preset.addEventListener("change", () => {
      if (this.#preset.value === "custom") return;
      const [width, height] = this.#preset.value.split("x");
      this.#width.value = width!; this.#height.value = height!; this.#aspect.value = "free";
    });
    this.#width.addEventListener("input", () => this.updateLinkedDimension("width"));
    this.#height.addEventListener("input", () => this.updateLinkedDimension("height"));
    this.#aspect.addEventListener("change", () => this.updateLinkedDimension("width"));
    this.#format.addEventListener("change", () => this.updateTransparencyWarning());
    element<HTMLInputElement>("#newImageTransparent").addEventListener("change", event => {
      const transparent = (event.currentTarget as HTMLInputElement).checked;
      element<HTMLInputElement>("#newImageColor").disabled = transparent;
      this.updateTransparencyWarning();
    });
  }

  private updateLinkedDimension(source: "width" | "height"): void {
    this.#preset.value = "custom";
    const ratio = this.#aspect.value === "free" ? null : Number(this.#aspect.value);
    if (!ratio || !Number.isFinite(ratio)) return;
    if (source === "width" && Number(this.#width.value) > 0) this.#height.value = String(linkedDimension(this.#width.value, ratio, source));
    if (source === "height" && Number(this.#height.value) > 0) this.#width.value = String(linkedDimension(this.#height.value, ratio, source));
  }

  private create(): void {
    const width = clampDimension(this.#width.value), height = clampDimension(this.#height.value);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    this.documentModel.create({
      name: element<HTMLInputElement>("#newImageName").value.trim() || "untitled", width, height,
      transparent: element<HTMLInputElement>("#newImageTransparent").checked,
      background: element<HTMLInputElement>("#newImageColor").value,
      format: imageFormat(this.#format.value).mimeType
    });
    this.dialog.close();
  }

  private updateTransparencyWarning(): void {
    const warning = element("#transparencyWarning");
    const transparent = element<HTMLInputElement>("#newImageTransparent").checked;
    warning.textContent = transparencyWarning(this.#format.value);
    warning.classList.toggle("hidden", !transparent);
  }
}
