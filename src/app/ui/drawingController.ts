import { canvasPoint, configureStroke, drawFreehandStroke, drawShape, type StrokeOptions } from "../helpers/drawingHelpers";
import { element } from "../helpers/domHelpers";
import type { CropRect, PaintTool, Point, Tool } from "../models/appTypes";
import { DRAWING_TOOL_DEFINITIONS, PAINT_TOOL_DEFINITIONS, PAINT_TOOLS, SHAPE_TOOL_DEFINITIONS, SHAPE_TOOLS, UTILITY_TOOL_DEFINITIONS } from "../models/drawingToolCatalog";
import { CanvasDocument } from "../models/imageDocument";
import { GenericToolbar } from "./genericToolbar";

const TOOL_SHORTCUTS: Readonly<Record<string, Tool>> = {
  p: "pencil", b: "brush", m: "marker", h: "highlighter", a: "calligraphy", s: "spray",
  e: "eraser", l: "line", r: "rectangle", o: "ellipse", i: "picker", c: "crop"
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
  #tool: Tool = "brush";
  #drawing = false;
  #start: Point = { x: 0, y: 0 };
  #last: Point = { x: 0, y: 0 };
  #crop: CropRect | null = null;
  #restoredColor = false;

  constructor(readonly documentModel: CanvasDocument) {
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
    this.documentModel.overlay.style.cursor = tool === "eraser" ? "cell" : tool === "picker" ? "copy" : "crosshair";
    this.updateToolOptions();
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
    overlay.addEventListener("pointermove", event => this.onPointerMove(event));
    overlay.addEventListener("pointerup", event => this.onPointerUp(event));
    overlay.addEventListener("pointercancel", event => this.onPointerUp(event));
    this.#applyCrop.addEventListener("click", () => {
      if (!this.#crop) return;
      this.documentModel.crop(this.#crop); this.#crop = null; this.#applyCrop.classList.add("hidden");
    });
    this.bindRange(this.#size, "#sizeValue", value => `${value} px`);
    this.bindRange(this.#opacity, "#opacityValue", value => `${value}%`);
    this.bindRange(this.#hardness, "#hardnessValue", value => `${value}%`);
  }

  private bindRange(input: HTMLInputElement, outputSelector: string, format: (value: string) => string): void {
    input.addEventListener("input", () => { element(outputSelector).textContent = format(input.value); });
  }

  private syncRangeLabels(): void {
    element("#sizeValue").textContent = `${this.#size.value} px`;
    element("#opacityValue").textContent = `${this.#opacity.value}%`;
    element("#hardnessValue").textContent = `${this.#hardness.value}%`;
  }

  private updateToolOptions(): void {
    element(".shape-option").classList.toggle("hidden", !SHAPE_TOOLS.has(this.#tool));
    this.#hardness.closest("label")!.classList.toggle("hidden", !PAINT_TOOLS.has(this.#tool));
  }

  private point(event: PointerEvent): Point {
    return canvasPoint(event, this.documentModel.overlay.getBoundingClientRect(), this.documentModel.width, this.documentModel.height);
  }

  private strokeOptions(): StrokeOptions {
    return { color: this.#color.value, size: Number(this.#size.value), opacity: Number(this.#opacity.value) / 100, hardness: Number(this.#hardness.value) / 100 };
  }

  private renderShape(context: CanvasRenderingContext2D, from: Point, to: Point): void {
    context.save(); configureStroke(context, this.strokeOptions()); drawShape(context, this.#tool, from, to, this.#fill.checked); context.restore();
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.documentModel.hasImage) return;
    const point = this.point(event);
    if (this.#tool === "picker") {
      const pixel = this.documentModel.context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
      this.#color.value = `#${[pixel[0], pixel[1], pixel[2]].map(value => value!.toString(16).padStart(2, "0")).join("")}`;
      this.#toolbar.persist();
      return;
    }
    this.#drawing = true; this.#start = this.#last = point;
    this.documentModel.overlay.setPointerCapture(event.pointerId);
    if (isPaintTool(this.#tool)) this.paint(point, { x: point.x + .01, y: point.y + .01 }, event.pressure);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.#drawing) return;
    const point = this.point(event);
    if (isPaintTool(this.#tool)) { this.paint(this.#last, point, event.pressure); this.#last = point; }
    else { this.documentModel.clearOverlay(); this.renderShape(this.documentModel.overlayContext, this.#start, point); }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.#drawing) return;
    this.#drawing = false;
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
  }

  private paint(from: Point, to: Point, pressure: number): void {
    drawFreehandStroke(this.documentModel.context, this.#tool as PaintTool, from, to, this.strokeOptions(), pressure || 1);
  }
}

function isPaintTool(tool: Tool): tool is PaintTool { return PAINT_TOOLS.has(tool); }
