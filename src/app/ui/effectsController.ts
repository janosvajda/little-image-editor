import { element } from "../helpers/domHelpers";
import { applyColorEffect, applySharpen, type ColorEffect } from "../helpers/imageFilterHelpers";
import type { HistorySnapshot } from "../models/appTypes";
import { CanvasDocument } from "../models/imageDocument";
import { PersistentDocumentToolbar } from "./genericToolbar";

type Effect = ColorEffect | "sharpen";
interface EffectState { previewBase?: HistorySnapshot; lastAppliedBase?: HistorySnapshot; }

const EFFECTS: Readonly<Record<Effect, { label: string; maximum: number; hint: string }>> = {
  monochrome: { label: "Intensity", maximum: 100, hint: "Convert colours to shades of gray." },
  sepia: { label: "Intensity", maximum: 100, hint: "Blend warm brown tones into the image." },
  invert: { label: "Amount", maximum: 100, hint: "Reverse colours by the selected amount." },
  sharpen: { label: "Strength", maximum: 200, hint: "Increase local edge contrast. High values can create halos." }
};

export class EffectsController {
  readonly #root = element<HTMLElement>('[data-panel="effects"]');
  readonly #effect = element<HTMLSelectElement>("#effectSelect");
  readonly #amount = element<HTMLInputElement>("#effectAmountInput");
  readonly #amountName = element<HTMLElement>("#effectAmountName");
  readonly #amountValue = element<HTMLElement>("#effectAmountValue");
  readonly #hint = element<HTMLElement>("#effectHint");
  readonly #applyButton = element<HTMLButtonElement>("#applyEffectButton");
  readonly #previewButton = element<HTMLButtonElement>("#cancelEffectButton");
  readonly #clearButton = document.createElement("button");
  readonly #toolbar: PersistentDocumentToolbar<EffectState>;
  #previewBase: ImageData | null = null;
  #lastAppliedBase: ImageData | null = null;
  #changingHistory = false;

  constructor(readonly documentModel: CanvasDocument) {
    this.initializeUi();
    this.#toolbar = new PersistentDocumentToolbar(this.#root, documentModel, "effects");
    this.#toolbar.onRestore(state => {
      this.#previewBase = state?.previewBase ? imageData(state.previewBase) : null;
      this.#lastAppliedBase = state?.lastAppliedBase ? imageData(state.lastAppliedBase) : null;
      this.updateControls(); this.updateActions();
    });
    this.#effect.addEventListener("change", () => { this.updateControls(); this.refreshPreview(); });
    this.#amount.addEventListener("input", () => { this.updateAmountLabel(); this.refreshPreview(); });
    this.#previewButton.addEventListener("click", () => this.togglePreview());
    this.#applyButton.addEventListener("click", () => this.apply());
    this.#clearButton.addEventListener("click", () => this.clearLastEffect());
    documentModel.onDocumentChange(({ hasImage }) => { this.#previewButton.disabled = this.#applyButton.disabled = !hasImage; this.updateActions(); });
    documentModel.onHistoryChange(() => {
      if (this.#changingHistory || (!this.#previewBase && !this.#lastAppliedBase)) return;
      this.#previewBase = null; this.#lastAppliedBase = null; this.persistEffectState(); this.updateActions();
    });
    this.updateControls(); this.updateActions();
  }

  private initializeUi(): void {
    this.#effect.size = 1;
    this.#effect.classList.remove("effect-list");
    this.#effect.setAttribute("aria-label", "Effect");
    this.#effect.closest("label")!.classList.remove("effect-list-control");
    this.#previewButton.id = "previewEffectButton"; this.#previewButton.textContent = "Preview";
    this.#clearButton.type = "button"; this.#clearButton.id = "clearEffectButton"; this.#clearButton.className = "wide"; this.#clearButton.textContent = "Clear last effect";
    this.#root.querySelector(".panel-body")!.append(this.#clearButton);
  }

  private updateControls(): void {
    const configuration = EFFECTS[this.#effect.value as Effect];
    this.#amountName.textContent = configuration.label;
    this.#amount.max = String(configuration.maximum);
    if (Number(this.#amount.value) > configuration.maximum) this.#amount.value = String(configuration.maximum);
    this.#hint.textContent = configuration.hint;
    this.updateAmountLabel();
  }

  private updateAmountLabel(): void { this.#amountValue.textContent = `${this.#amount.value}%`; }

  private togglePreview(): void {
    if (this.#previewBase) { this.documentModel.context.putImageData(this.#previewBase, 0, 0); this.#previewBase = null; }
    else if (this.documentModel.hasImage) { this.#previewBase = this.captureCurrent(); this.renderEffect(this.#previewBase); }
    this.persistEffectState(); this.updateActions();
  }

  private refreshPreview(): void { if (this.#previewBase) this.renderEffect(this.#previewBase); }

  private apply(): void {
    if (!this.documentModel.hasImage) return;
    const base = this.#previewBase ?? this.captureCurrent();
    if (!this.#previewBase) this.renderEffect(base);
    this.#previewBase = null; this.#lastAppliedBase = base;
    this.#changingHistory = true;
    try { this.documentModel.commit(); } finally { this.#changingHistory = false; }
    this.persistEffectState(); this.updateActions();
  }

  private clearLastEffect(): void {
    if (!this.#lastAppliedBase || this.#previewBase) return;
    this.documentModel.context.putImageData(this.#lastAppliedBase, 0, 0);
    this.#lastAppliedBase = null; this.#changingHistory = true;
    try { this.documentModel.commit(); } finally { this.#changingHistory = false; }
    this.persistEffectState(); this.updateActions();
  }

  private renderEffect(base: ImageData): void {
    const result = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    const amount = Number(this.#amount.value) / 100;
    const effect = this.#effect.value as Effect;
    if (effect === "sharpen") applySharpen(result, amount); else applyColorEffect(result, effect, amount);
    this.documentModel.context.putImageData(result, 0, 0);
  }

  private captureCurrent(): ImageData { return this.documentModel.context.getImageData(0, 0, this.documentModel.width, this.documentModel.height); }

  private persistEffectState(): void {
    this.#toolbar.setExtra({
      previewBase: this.#previewBase ? snapshot(this.#previewBase) : undefined,
      lastAppliedBase: this.#lastAppliedBase ? snapshot(this.#lastAppliedBase) : undefined
    });
  }

  private updateActions(): void {
    this.#previewButton.textContent = this.#previewBase ? "Cancel preview" : "Preview";
    this.#clearButton.disabled = !this.#lastAppliedBase || Boolean(this.#previewBase) || !this.documentModel.hasImage;
  }
}

function snapshot(image: ImageData): HistorySnapshot { return { width: image.width, height: image.height, pixels: new Uint8ClampedArray(image.data) }; }
function imageData(value: HistorySnapshot): ImageData { return new ImageData(new Uint8ClampedArray(value.pixels), value.width, value.height); }
