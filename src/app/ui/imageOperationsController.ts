import { applyColorEffect, applySharpen, applyToneAdjustments } from "../helpers/imageFilterHelpers.js";
import { element, elements } from "../helpers/domHelpers.js";
import { CanvasDocument } from "../models/imageDocument.js";

type Effect = "grayscale" | "sepia" | "invert" | "sharpen";

export class ImageOperations {
  readonly #filters = elements<HTMLInputElement>("[data-filter]");
  #adjustmentBase: ImageData | null = null;

  constructor(readonly documentModel: CanvasDocument) {
    this.bindEvents();
  }

  resetControls(): void {
    this.#filters.forEach(input => { input.value = "0"; this.updateLabel(input); });
  }

  private bindEvents(): void {
    this.#filters.forEach(input => {
      input.addEventListener("input", () => { this.updateLabel(input); this.previewAdjustments(); });
      input.addEventListener("change", () => {
        if (!this.#adjustmentBase) return;
        this.documentModel.commit(); this.#adjustmentBase = null; this.resetControls();
      });
    });
    elements<HTMLElement>("[data-effect]").forEach(button => button.addEventListener("click", () => this.applyEffect(button.dataset.effect as Effect)));
    element("#resetFiltersButton").addEventListener("click", () => {
      if (this.#adjustmentBase) this.documentModel.context.putImageData(this.#adjustmentBase, 0, 0);
      this.#adjustmentBase = null; this.resetControls();
    });
    element("#rotateLeftButton").addEventListener("click", () => this.documentModel.transform(-90));
    element("#rotateRightButton").addEventListener("click", () => this.documentModel.transform(90));
    element("#flipHButton").addEventListener("click", () => this.documentModel.transform(0, -1, 1));
    element("#flipVButton").addEventListener("click", () => this.documentModel.transform(0, 1, -1));
    element("#resizeButton").addEventListener("click", () => this.documentModel.resize(Number(element<HTMLInputElement>("#widthInput").value), Number(element<HTMLInputElement>("#heightInput").value)));
    this.documentModel.onHistoryChange(() => { this.#adjustmentBase = null; this.resetControls(); });
  }

  private updateLabel(input: HTMLInputElement): void {
    const label = document.querySelector<HTMLElement>(`#${input.dataset.filter}Value`);
    if (label) label.textContent = input.value;
  }

  private previewAdjustments(): void {
    if (!this.documentModel.hasImage) return;
    const { context, width, height } = this.documentModel;
    this.#adjustmentBase ??= context.getImageData(0, 0, width, height);
    const value = (name: string) => Number(this.#filters.find(input => input.dataset.filter === name)?.value ?? 0);
    const result = applyToneAdjustments(this.#adjustmentBase, {
      brightness: value("brightness"), contrast: value("contrast"), saturation: value("saturation")
    });
    context.putImageData(result, 0, 0);
  }

  private applyEffect(effect: Effect): void {
    if (!this.documentModel.hasImage) return;
    const { context, width, height } = this.documentModel;
    const image = context.getImageData(0, 0, width, height);
    if (effect === "sharpen") applySharpen(image);
    else applyColorEffect(image, effect);
    context.putImageData(image, 0, 0); this.documentModel.commit();
  }
}
