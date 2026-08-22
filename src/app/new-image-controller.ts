import { CanvasDocument } from "./canvas-document.js";
import { element } from "./dom.js";

const MAX_DIMENSION = 16_384;

export class NewImageController {
  readonly dialog = element<HTMLDialogElement>("#newImageDialog");
  readonly #preset = element<HTMLSelectElement>("#newImagePreset");
  readonly #aspect = element<HTMLSelectElement>("#newImageAspect");
  readonly #width = element<HTMLInputElement>("#newImageWidth");
  readonly #height = element<HTMLInputElement>("#newImageHeight");

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
    element<HTMLInputElement>("#newImageTransparent").addEventListener("change", event => {
      const transparent = (event.currentTarget as HTMLInputElement).checked;
      element<HTMLInputElement>("#newImageColor").disabled = transparent;
      element("#transparencyWarning").classList.toggle("hidden", !transparent);
    });
  }

  private updateLinkedDimension(source: "width" | "height"): void {
    this.#preset.value = "custom";
    const ratio = this.#aspect.value === "free" ? null : Number(this.#aspect.value);
    if (!ratio || !Number.isFinite(ratio)) return;
    if (source === "width" && Number(this.#width.value) > 0) this.#height.value = String(Math.max(1, Math.round(Number(this.#width.value) / ratio)));
    if (source === "height" && Number(this.#height.value) > 0) this.#width.value = String(Math.max(1, Math.round(Number(this.#height.value) * ratio)));
  }

  private create(): void {
    const clamp = (value: string) => Math.max(1, Math.min(MAX_DIMENSION, Math.round(Number(value))));
    const width = clamp(this.#width.value), height = clamp(this.#height.value);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    this.documentModel.create({
      name: element<HTMLInputElement>("#newImageName").value.trim() || "untitled", width, height,
      transparent: element<HTMLInputElement>("#newImageTransparent").checked,
      background: element<HTMLInputElement>("#newImageColor").value
    });
    this.dialog.close();
  }
}
