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
  readonly #name = element<HTMLInputElement>("#newImageName");
  readonly #nameError = element<HTMLElement>("#newImageNameError");
  readonly #resolution = document.createElement("select");
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
    this.#nameError.insertAdjacentHTML("afterend", '<label>File type<select id="newImageFormat"></select></label>');
    this.#format = element<HTMLSelectElement>("#newImageFormat");
    populateImageFormatSelect(this.#format);
    this.#resolution.id = "newImageResolution";
    this.#resolution.setAttribute("aria-label", "Resolution (PPI)");
    for (const ppi of [72, 96, 144, 150, 240, 300, 600, 1200]) {
      this.#resolution.append(new Option(`${ppi} PPI`, String(ppi), false, ppi === 96));
    }
    this.#format.closest("label")!.insertAdjacentElement("afterend", this.resolutionField());
    print.querySelectorAll("option").forEach(option => { option.dataset.resolution = "300"; });
  }

  private bindEvents(): void {
    element("#newImageButton").addEventListener("click", () => this.open());
    element("#quickNewButton").addEventListener("click", () => this.open());
    element("#createImageButton").addEventListener("click", () => this.create());
    this.#name.addEventListener("input", () => this.setNameValidity(true));
    this.#preset.addEventListener("change", () => {
      if (this.#preset.value === "custom") return;
      const [width, height] = this.#preset.value.split("x");
      this.#width.value = width!; this.#height.value = height!; this.#aspect.value = "free";
      this.#resolution.value = this.#preset.selectedOptions[0]?.dataset.resolution ?? "96";
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
    const name = this.#name.value.trim();
    if (!name) {
      this.setNameValidity(false);
      this.#name.focus();
      return;
    }
    const width = clampDimension(this.#width.value), height = clampDimension(this.#height.value);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    this.documentModel.create({
      name, width, height,
      transparent: element<HTMLInputElement>("#newImageTransparent").checked,
      background: element<HTMLInputElement>("#newImageColor").value,
      format: imageFormat(this.#format.value).mimeType,
      resolution: Number(this.#resolution.value)
    });
    this.dialog.close();
  }

  private setNameValidity(valid: boolean): void {
    this.#name.toggleAttribute("aria-invalid", !valid);
    this.#nameError.classList.toggle("hidden", valid);
  }

  private updateTransparencyWarning(): void {
    const warning = element("#transparencyWarning");
    const transparent = element<HTMLInputElement>("#newImageTransparent").checked;
    warning.textContent = transparencyWarning(this.#format.value);
    warning.classList.toggle("hidden", !transparent);
  }

  private resolutionField(): HTMLLabelElement {
    const label = document.createElement("label");
    label.append("Resolution (PPI)", this.#resolution);
    return label;
  }
}
