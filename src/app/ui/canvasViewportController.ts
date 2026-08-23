import { element } from "../helpers/domHelpers";
import { rulerTicks } from "../helpers/rulerHelpers";
import { MEASUREMENT_UNITS, MEASUREMENT_UNIT_LABELS, type MeasurementUnit } from "../models/measurementUnits";
import { CanvasDocument } from "../models/imageDocument";
import { PersistentDocumentToolbar } from "./genericToolbar";

const ZOOM_LEVELS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 800] as const;
const RULER_SIZE = 32;

export class CanvasViewportController {
  readonly #wrap = element<HTMLElement>("#canvasWrap");
  readonly #viewport = document.createElement("div");
  readonly #rulerLayer = document.createElement("div");
  readonly #stage = document.createElement("div");
  readonly #horizontalRuler = document.createElement("div");
  readonly #verticalRuler = document.createElement("div");
  readonly #corner = document.createElement("div");
  readonly #controls = document.createElement("div");
  readonly #zoomSelect = document.createElement("select");
  readonly #unitSelect = document.createElement("select");
  readonly #rulerButton = document.createElement("button");
  readonly #rulerVisible = document.createElement("input");
  readonly #toolbar: PersistentDocumentToolbar;

  constructor(readonly documentModel: CanvasDocument) {
    this.createViewport();
    this.createControls();
    this.#toolbar = new PersistentDocumentToolbar(this.#controls, documentModel, "viewport");
    this.#toolbar.onRestore(() => this.applyView());
    this.bindEvents();
    documentModel.onDocumentChange(() => this.applyView());
    this.applyView();
  }

  get zoom(): number { return Number(this.#zoomSelect.value) / 100; }
  get unit(): MeasurementUnit { return MEASUREMENT_UNITS.includes(this.#unitSelect.value as MeasurementUnit) ? this.#unitSelect.value as MeasurementUnit : "px"; }
  get rulersVisible(): boolean { return this.#rulerVisible.checked; }

  zoomIn(): void { this.stepZoom(1); }
  zoomOut(): void { this.stepZoom(-1); }
  actualPixels(): void { this.setZoomLevel(100); }

  fitToWindow(): void {
    if (!this.documentModel.hasImage) return;
    const rulerSize = this.rulersVisible ? RULER_SIZE : 0;
    const availableWidth = Math.max(1, this.#wrap.clientWidth - rulerSize - 80);
    const availableHeight = Math.max(1, this.#wrap.clientHeight - rulerSize - 80);
    const maximumPercent = Math.min(availableWidth / this.documentModel.width, availableHeight / this.documentModel.height) * 100;
    const level = [...ZOOM_LEVELS].reverse().find(candidate => candidate <= maximumPercent) ?? ZOOM_LEVELS[0];
    this.setZoomLevel(level);
  }

  zoomAt(clientX: number, clientY: number, direction: -1 | 1): void {
    const before = this.documentModel.overlay.getBoundingClientRect();
    if (before.width <= 0 || before.height <= 0) { this.stepZoom(direction); return; }
    const imagePoint = { x: (clientX - before.left) / before.width, y: (clientY - before.top) / before.height };
    this.stepZoom(direction);
    const after = this.documentModel.overlay.getBoundingClientRect();
    this.#wrap.scrollLeft += after.left + imagePoint.x * after.width - clientX;
    this.#wrap.scrollTop += after.top + imagePoint.y * after.height - clientY;
  }

  private createViewport(): void {
    this.#viewport.className = "canvas-viewport";
    this.#rulerLayer.className = "canvas-ruler-layer";
    this.#stage.className = "canvas-stage";
    this.#horizontalRuler.className = "canvas-ruler horizontal-ruler";
    this.#verticalRuler.className = "canvas-ruler vertical-ruler";
    this.#corner.className = "ruler-corner";
    this.#stage.append(this.documentModel.canvas, this.documentModel.overlay);
    this.#viewport.append(this.#stage);
    this.#rulerLayer.append(this.#corner, this.#horizontalRuler, this.#verticalRuler);
    this.#wrap.append(this.#viewport);
    this.#wrap.parentElement!.append(this.#rulerLayer);
  }

  private createControls(): void {
    this.#controls.className = "viewport-controls";
    this.#controls.dataset.toolbarKey = "viewport";
    this.#controls.setAttribute("role", "group");
    this.#controls.setAttribute("aria-label", "Zoom and rulers");
    this.#zoomSelect.id = "zoomSelect";
    this.#zoomSelect.title = "Canvas zoom";
    this.#zoomSelect.append(...ZOOM_LEVELS.map(level => new Option(`${level}%`, String(level), level === 100, level === 100)));
    this.#unitSelect.id = "rulerUnitSelect";
    this.#unitSelect.title = "Ruler measurement unit (96 PPI)";
    this.#unitSelect.append(...MEASUREMENT_UNITS.map(unit => new Option(MEASUREMENT_UNIT_LABELS[unit], unit)));
    this.#rulerButton.id = "rulerToggleButton";
    this.#rulerButton.className = "icon-button active";
    this.#rulerButton.title = "Show or hide rulers";
    this.#rulerButton.setAttribute("aria-label", "Show rulers");
    this.#rulerButton.setAttribute("aria-pressed", "true");
    this.#rulerButton.textContent = "⌑";
    this.#rulerVisible.id = "rulerVisibleInput";
    this.#rulerVisible.type = "checkbox";
    this.#rulerVisible.checked = true;
    this.#rulerVisible.hidden = true;
    this.#controls.append(this.controlButton("−", "Zoom out", () => this.stepZoom(-1)), this.#zoomSelect, this.controlButton("+", "Zoom in", () => this.stepZoom(1)), this.#rulerButton, this.#unitSelect, this.#rulerVisible);
    element(".toolbar").insertBefore(this.#controls, element("#focusButton"));
  }

  private controlButton(label: string, title: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button"; button.className = "icon-button"; button.textContent = label; button.title = title;
    button.addEventListener("click", action);
    return button;
  }

  private bindEvents(): void {
    this.#zoomSelect.addEventListener("change", () => this.applyView());
    this.#unitSelect.addEventListener("change", () => this.renderRulers());
    this.#rulerButton.addEventListener("click", () => {
      const visible = !this.rulersVisible;
      this.#rulerVisible.checked = visible;
      this.#rulerButton.setAttribute("aria-pressed", String(visible));
      this.#rulerButton.classList.toggle("active", visible);
      this.applyView(); this.#toolbar.persist();
    });
    this.#wrap.addEventListener("scroll", () => this.pinRulersToViewport(), { passive: true });
    window.addEventListener("resize", () => this.applyView());
    document.addEventListener("keydown", event => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "+" || event.key === "=") { event.preventDefault(); this.zoomIn(); }
      else if (event.key === "-") { event.preventDefault(); this.zoomOut(); }
      else if (event.key === "0") { event.preventDefault(); this.fitToWindow(); }
      else if (event.key === "1") { event.preventDefault(); this.actualPixels(); }
    });
  }

  private stepZoom(direction: -1 | 1): void {
    const current = Number(this.#zoomSelect.value);
    const index = ZOOM_LEVELS.findIndex(level => level === current);
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, (index < 0 ? ZOOM_LEVELS.indexOf(100) : index) + direction))]!;
    this.setZoomLevel(next);
  }

  private setZoomLevel(level: number): void {
    this.#zoomSelect.value = String(level);
    this.applyView(); this.#toolbar.persist();
  }

  private applyView(): void {
    const zoom = this.zoom;
    const rulerSize = this.rulersVisible ? RULER_SIZE : 0;
    const width = Math.max(1, this.documentModel.width * zoom);
    const height = Math.max(1, this.documentModel.height * zoom);
    this.#viewport.style.width = `${width + rulerSize}px`;
    this.#viewport.style.height = `${height + rulerSize}px`;
    this.#stage.style.left = `${rulerSize}px`; this.#stage.style.top = `${rulerSize}px`;
    this.#stage.style.width = `${width}px`; this.#stage.style.height = `${height}px`;
    for (const canvas of [this.documentModel.canvas, this.documentModel.overlay]) {
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    }
    this.#viewport.classList.toggle("rulers-hidden", !this.rulersVisible);
    this.#rulerLayer.classList.toggle("hidden", !this.rulersVisible || !this.documentModel.hasImage);
    this.#rulerButton.setAttribute("aria-pressed", String(this.rulersVisible));
    this.#rulerButton.classList.toggle("active", this.rulersVisible);
    element("#zoomLabel").textContent = `${Math.round(zoom * 100)}%`;
    this.pinRulersToViewport();
    this.renderRulers();
  }

  private pinRulersToViewport(): void {
    const x = Math.max(0, this.#wrap.scrollLeft);
    const y = Math.max(0, this.#wrap.scrollTop);
    this.#horizontalRuler.style.setProperty("--ruler-scroll", `${x}px`);
    this.#verticalRuler.style.setProperty("--ruler-scroll", `${y}px`);
  }

  private renderRulers(): void {
    if (!this.rulersVisible) return;
    const resolution = this.documentModel.resolution;
    this.#unitSelect.title = this.unit === "px" ? "Ruler measurement unit" : `Document measurement at ${resolution} PPI (not physical screen size)`;
    this.#horizontalRuler.replaceChildren(...rulerTicks(this.documentModel.width, this.zoom, this.unit, 72, resolution).map(tick => this.tick(tick.pixelPosition, tick.label, false)));
    this.#verticalRuler.replaceChildren(...rulerTicks(this.documentModel.height, this.zoom, this.unit, 72, resolution).map(tick => this.tick(tick.pixelPosition, tick.label, true)));
    this.#corner.textContent = this.unit;
    this.#corner.title = this.unit === "px" ? "Pixels" : `${MEASUREMENT_UNIT_LABELS[this.unit]} at ${resolution} PPI`;
  }

  private tick(position: number, label: string, vertical: boolean): HTMLElement {
    const tick = document.createElement("span");
    tick.className = "ruler-tick"; tick.textContent = label;
    tick.style[vertical ? "top" : "left"] = `calc(${position}px - var(--ruler-scroll, 0px))`;
    return tick;
  }
}
