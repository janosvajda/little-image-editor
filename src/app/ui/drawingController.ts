import { canvasPoint, configureStroke, drawFreehandStroke, drawShape, type StrokeOptions } from "../helpers/drawingHelpers";
import { floodFill } from "../helpers/floodFillHelpers";
import { element } from "../helpers/domHelpers";
import type { CropRect, PaintTool, Point, Tool } from "../models/appTypes";
import { DRAWING_TOOL_DEFINITIONS, PAINT_TOOL_DEFINITIONS, PAINT_TOOLS, SHAPE_TOOL_DEFINITIONS, SHAPE_TOOLS, UTILITY_TOOL_DEFINITIONS } from "../models/drawingToolCatalog";
import { CanvasDocument } from "../models/imageDocument";
import { GenericToolbar } from "./genericToolbar";
import type { CanvasViewportController } from "./canvasViewportController";

const TOOL_SHORTCUTS: Readonly<Record<string, Tool>> = {
  p: "pencil", b: "brush", m: "marker", h: "highlighter", a: "calligraphy", s: "spray",
  e: "eraser", l: "line", r: "rectangle", o: "ellipse", i: "picker", c: "crop", z: "zoom", f: "fill"
};
export class DrawingController {
  readonly #toolsPanel = element<HTMLElement>('[data-panel="tools"]');
  readonly #color = element<HTMLInputElement>("#colorInput");
  readonly #size = element<HTMLInputElement>("#sizeInput");
  readonly #opacity = element<HTMLInputElement>("#opacityInput");
  readonly #hardness = element<HTMLInputElement>("#hardnessInput");
  readonly #fill = element<HTMLInputElement>("#fillInput");
  readonly #applyCrop = element<HTMLButtonElement>("#applyCropButton");
  readonly #paintSelect = element<HTMLSelectElement>("#paintToolSelect");
  readonly #shapeSelect = element<HTMLSelectElement>("#shapeToolSelect");
  readonly #toolbar: GenericToolbar<Tool>;
  readonly #zoomOptions: HTMLElement | null;
  readonly #fillOptions: HTMLElement;
  readonly #fillColor: HTMLInputElement;
  readonly #fillTolerance: HTMLInputElement;
  readonly #pickerOptions: HTMLElement;
  readonly #pickerSwatch: HTMLElement;
  readonly #cropOptions: HTMLElement;
  readonly #contextHint: HTMLElement;
  #tool: Tool = "brush";
  #drawing = false;
  #start: Point = { x: 0, y: 0 };
  #last: Point = { x: 0, y: 0 };
  #crop: CropRect | null = null;
  #restoredColor = false;
  #activeStrokeOptions: StrokeOptions | null = null;

  constructor(readonly documentModel: CanvasDocument, readonly viewport?: CanvasViewportController) {
    const fillControls = this.createFillOptions();
    this.#fillOptions = fillControls.root;
    this.#fillColor = fillControls.color;
    this.#fillTolerance = fillControls.tolerance;
    const pickerControls = this.createPickerOptions();
    this.#pickerOptions = pickerControls.root;
    this.#pickerSwatch = pickerControls.swatch;
    this.#cropOptions = this.createCropOptions();
    this.#contextHint = this.createContextHint();
    this.#toolbar = new GenericToolbar<Tool>({
      root: this.#toolsPanel,
      tools: DRAWING_TOOL_DEFINITIONS,
      selectGroups: [
        { control: element("#paintToolControl"), icon: element(".tool-select-icon", element("#paintToolControl")), select: this.#paintSelect, tools: PAINT_TOOL_DEFINITIONS, defaultTool: "brush" },
        { control: element("#shapeToolControl"), icon: element(".tool-select-icon", element("#shapeToolControl")), select: this.#shapeSelect, tools: SHAPE_TOOL_DEFINITIONS, defaultTool: "rectangle" }
      ],
      buttonContainer: element(".utility-tools"), buttonTools: UTILITY_TOOL_DEFINITIONS, defaultTool: "brush",
      documentModel, stateKey: "drawing"
    });
    this.#zoomOptions = viewport ? this.createViewOptions(viewport) : null;
    this.#restoredColor = this.#toolbar.restoredControlIds.has("colorInput");
    this.syncRangeLabels();
    this.#toolbar.onSelection(tool => this.activateTool(tool));
    this.bindEvents(); this.activateTool(this.#toolbar.activeTool);
  }

  setInitialColor(theme: string): void {
    if (this.#restoredColor) return;
    this.#color.value = theme === "light" ? "#000000" : "#ffffff";
    this.#toolbar.refreshDefaults();
    this.#toolbar.persist();
  }

  select(tool: Tool): void { this.#toolbar.select(tool); }

  private activateTool(tool: Tool): void {
    this.#tool = tool;
    this.documentModel.overlay.classList.toggle("fill-cursor", tool === "fill");
    this.documentModel.overlay.style.cursor = tool === "eraser" ? "cell" : tool === "fill" ? "" : tool === "picker" ? "copy" : tool === "zoom" ? "zoom-in" : "crosshair";
    this.updateToolOptions();
    this.syncRangeLabels();
    if (tool !== "crop") {
      this.#crop = null; this.#applyCrop.classList.add("hidden"); this.documentModel.clearOverlay();
    }
  }

  selectFromShortcut(key: string): boolean {
    const tool = TOOL_SHORTCUTS[key.toLowerCase()];
    if (!tool) return false;
    this.select(tool); return true;
  }

  private bindEvents(): void {
    const overlay = this.documentModel.overlay;
    overlay.addEventListener("pointerdown", event => this.onPointerDown(event));
    overlay.addEventListener("pointermove", event => { this.updateZoomCursor(event.altKey); this.onPointerMove(event); });
    overlay.addEventListener("pointerenter", event => this.updateZoomCursor(event.altKey));
    overlay.addEventListener("pointerup", event => this.onPointerUp(event));
    overlay.addEventListener("pointercancel", event => this.onPointerUp(event));
    document.addEventListener("keydown", event => this.updateZoomCursor(event.altKey));
    document.addEventListener("keyup", event => this.updateZoomCursor(event.altKey));
    window.addEventListener("blur", () => this.updateZoomCursor(false));
    this.#applyCrop.addEventListener("click", () => {
      if (!this.#crop) return;
      this.documentModel.crop(this.#crop); this.#crop = null; this.#applyCrop.classList.add("hidden");
    });
    this.bindRange(this.#size, "#sizeValue", value => `${value} px`);
    this.bindRange(this.#opacity, "#opacityValue", value => `${value}%`);
    this.bindRange(this.#hardness, "#hardnessValue", value => `${value}%`);
    this.bindRange(this.#fillTolerance, "#fillToleranceValue", value => value);
  }

  private bindRange(input: HTMLInputElement, outputSelector: string, format: (value: string) => string): void {
    input.addEventListener("input", () => { element(outputSelector).textContent = format(input.value); });
  }

  private syncRangeLabels(): void {
    element("#sizeValue").textContent = `${this.#size.value} px`;
    element("#opacityValue").textContent = `${this.#opacity.value}%`;
    element("#hardnessValue").textContent = `${this.#hardness.value}%`;
    element("#fillToleranceValue").textContent = this.#fillTolerance.value;
  }

  private updateToolOptions(): void {
    const paints = PAINT_TOOLS.has(this.#tool), shapes = SHAPE_TOOLS.has(this.#tool);
    element(".shape-option").classList.toggle("hidden", !shapes);
    this.#hardness.closest("label")!.classList.toggle("hidden", !paints);
    this.#size.closest("label")!.classList.toggle("hidden", !(paints || shapes));
    this.#color.closest("label")!.classList.toggle("hidden", !(paints || shapes));
    this.#opacity.closest("label")!.classList.toggle("hidden", !(paints || shapes || this.#tool === "fill"));
    this.#fillOptions.classList.toggle("hidden", this.#tool !== "fill");
    this.#pickerOptions.classList.toggle("hidden", this.#tool !== "picker");
    this.#cropOptions.classList.toggle("hidden", this.#tool !== "crop");
    this.#contextHint.classList.toggle("hidden", this.#tool !== "zoom");
    if (this.#tool === "picker") this.updatePickerSwatch(this.#color.value);
  }

  private createFillOptions(): { root: HTMLElement; color: HTMLInputElement; tolerance: HTMLInputElement } {
    const root = document.createElement("div");
    root.className = "fill-tool-options hidden";
    root.innerHTML = '<label>Fill color <input id="fillColorInput" type="color" value="#000000"></label><label>Tolerance <span id="fillToleranceValue">32</span><input id="fillToleranceInput" type="range" min="0" max="255" value="32"></label>';
    element(".tool-options", this.#toolsPanel).prepend(root);
    return { root, color: element<HTMLInputElement>("#fillColorInput", root), tolerance: element<HTMLInputElement>("#fillToleranceInput", root) };
  }

  private createPickerOptions(): { root: HTMLElement; swatch: HTMLElement } {
    const root = document.createElement("div");
    root.className = "picker-tool-options hidden";
    root.innerHTML = '<p class="tool-hint">Click pixels repeatedly to sample colours. Paint uses the latest sample automatically.</p><div class="sampled-color"><span>Sampled colour</span><i aria-hidden="true"></i><code>#000000</code></div><div class="context-actions"><button type="button" data-use-color="fill">Copy to fill colour</button></div>';
    root.addEventListener("click", event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-use-color]");
      if (!target) return;
      this.#fillColor.value = this.#color.value;
      this.#toolbar.persist();
    });
    element(".tool-options", this.#toolsPanel).prepend(root);
    return { root, swatch: element<HTMLElement>(".sampled-color", root) };
  }

  private createCropOptions(): HTMLElement {
    const root = document.createElement("div");
    root.className = "crop-tool-options hidden";
    root.innerHTML = '<p class="tool-hint">Drag over the image to define the crop area.</p><div class="context-actions"><button type="button" data-cancel-crop>Cancel</button></div>';
    root.append(this.#applyCrop);
    element<HTMLButtonElement>("[data-cancel-crop]", root).addEventListener("click", () => {
      this.#crop = null; this.#applyCrop.classList.add("hidden"); this.documentModel.clearOverlay();
    });
    element(".tool-options", this.#toolsPanel).prepend(root);
    return root;
  }

  private createContextHint(): HTMLElement {
    const hint = document.createElement("p");
    hint.className = "tool-hint zoom-tool-hint hidden";
    hint.textContent = "Click to zoom in. Alt/Option-click to zoom out.";
    element(".tool-options", this.#toolsPanel).prepend(hint);
    return hint;
  }

  private createViewOptions(viewport: CanvasViewportController): HTMLElement {
    const options = document.createElement("div");
    options.className = "zoom-tool-options";
    options.setAttribute("aria-label", "View zoom controls");
    const heading = document.createElement("small"); heading.className = "tool-section-title"; heading.textContent = "View";
    const actions: ReadonlyArray<readonly [string, string, () => void]> = [
      ["−", "Zoom out", () => viewport.zoomOut()], ["+", "Zoom in", () => viewport.zoomIn()],
      ["Fit", "Fit image to window", () => viewport.fitToWindow()], ["100%", "Actual pixels", () => viewport.actualPixels()]
    ];
    options.append(heading, ...actions.map(([label, title, action]) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label; button.title = title; button.addEventListener("click", action);
      return button;
    }));
    this.#toolsPanel.querySelector(".panel-body")!.append(options);
    return options;
  }

  private point(event: PointerEvent): Point {
    return canvasPoint(event, this.documentModel.overlay.getBoundingClientRect(), this.documentModel.width, this.documentModel.height);
  }

  private updateZoomCursor(zoomOut: boolean): void {
    if (this.#tool === "zoom") this.documentModel.overlay.style.cursor = zoomOut ? "zoom-out" : "zoom-in";
  }

  private strokeOptions(): StrokeOptions {
    return { color: this.#color.value, size: Number(this.#size.value), opacity: Number(this.#opacity.value) / 100, hardness: Number(this.#hardness.value) / 100 };
  }

  private renderShape(context: CanvasRenderingContext2D, from: Point, to: Point): void {
    context.save(); configureStroke(context, this.strokeOptions()); drawShape(context, this.#tool, from, to, this.#fill.checked); context.restore();
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.documentModel.hasImage) return;
    this.updateZoomCursor(event.altKey);
    const point = this.point(event);
    if (this.#tool === "picker") {
      const x = Math.max(0, Math.min(this.documentModel.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(this.documentModel.height - 1, Math.floor(point.y)));
      const pixel = this.documentModel.context.getImageData(x, y, 1, 1).data;
      this.#color.value = `#${[pixel[0], pixel[1], pixel[2]].map(value => value!.toString(16).padStart(2, "0")).join("")}`;
      this.updatePickerSwatch(this.#color.value);
      this.#toolbar.persist();
      return;
    }
    if (this.#tool === "zoom") {
      this.viewport?.zoomAt(event.clientX, event.clientY, event.altKey ? -1 : 1);
      return;
    }
    if (this.#tool === "fill") {
      const x = Math.max(0, Math.min(this.documentModel.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(this.documentModel.height - 1, Math.floor(point.y)));
      const changed = floodFill(this.documentModel.context, this.documentModel.width, this.documentModel.height, x, y, {
        color: this.#fillColor.value, opacity: Number(this.#opacity.value) / 100, tolerance: Number(this.#fillTolerance.value)
      });
      if (changed) this.documentModel.commit();
      return;
    }
    this.#drawing = true; this.#start = this.#last = point;
    this.#activeStrokeOptions = this.strokeOptions();
    this.documentModel.overlay.setPointerCapture(event.pointerId);
    if (isPaintTool(this.#tool)) this.paint(point, { x: point.x + .01, y: point.y + .01 }, event.pressure);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.#drawing) return;
    const point = this.point(event);
    if (isPaintTool(this.#tool)) {
      const samples = event.getCoalescedEvents?.() ?? [];
      for (const sample of samples) {
        const sampledPoint = this.point(sample);
        this.paint(this.#last, sampledPoint, sample.pressure);
        this.#last = sampledPoint;
      }
      const lastSample = samples.at(-1);
      if (!lastSample || lastSample.clientX !== event.clientX || lastSample.clientY !== event.clientY) {
        this.paint(this.#last, point, event.pressure);
        this.#last = point;
      }
    }
    else { this.documentModel.clearOverlay(); this.renderShape(this.documentModel.overlayContext, this.#start, point); }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.#drawing) return;
    this.#drawing = false;
    this.#activeStrokeOptions ??= this.strokeOptions();
    const point = this.point(event);
    if (SHAPE_TOOLS.has(this.#tool)) {
      this.documentModel.clearOverlay(); this.renderShape(this.documentModel.context, this.#start, point); this.documentModel.commit();
    } else if (this.#tool === "crop") {
      this.#crop = {
        x: Math.round(Math.min(this.#start.x, point.x)), y: Math.round(Math.min(this.#start.y, point.y)),
        width: Math.round(Math.abs(point.x - this.#start.x)), height: Math.round(Math.abs(point.y - this.#start.y))
      };
      this.#applyCrop.classList.toggle("hidden", this.#crop.width < 1 || this.#crop.height < 1);
    } else this.documentModel.commit();
    this.#activeStrokeOptions = null;
  }

  private paint(from: Point, to: Point, pressure: number): void {
    drawFreehandStroke(this.documentModel.context, this.#tool as PaintTool, from, to, this.#activeStrokeOptions ?? this.strokeOptions(), pressure || 1);
  }

  private updatePickerSwatch(color: string): void {
    element<HTMLElement>("i", this.#pickerSwatch).style.backgroundColor = color;
    element<HTMLElement>("code", this.#pickerSwatch).textContent = color.toUpperCase();
  }
}

function isPaintTool(tool: Tool): tool is PaintTool { return PAINT_TOOLS.has(tool); }
