import { CanvasDocument } from "../models/imageDocument.js";
import type { CropRect, Point, Tool } from "../models/appTypes.js";
import { canvasPoint, configureStroke, drawShape } from "../helpers/drawingHelpers.js";
import { element, elements } from "../helpers/domHelpers.js";

const SHAPE_TOOLS: readonly Tool[] = ["line", "rectangle", "ellipse"];
const TOOL_SHORTCUTS: Readonly<Record<string, Tool>> = { b: "brush", e: "eraser", l: "line", r: "rectangle", o: "ellipse", i: "picker", c: "crop" };

export class DrawingController {
  readonly #color = element<HTMLInputElement>("#colorInput");
  readonly #size = element<HTMLInputElement>("#sizeInput");
  readonly #fill = element<HTMLInputElement>("#fillInput");
  readonly #applyCrop = element<HTMLButtonElement>("#applyCropButton");
  #tool: Tool = "brush";
  #drawing = false;
  #start: Point = { x: 0, y: 0 };
  #last: Point = { x: 0, y: 0 };
  #crop: CropRect | null = null;

  constructor(readonly documentModel: CanvasDocument) {
    this.bindEvents();
  }

  setInitialColor(theme: string): void {
    this.#color.value = theme === "light" ? "#000000" : "#ffffff";
  }

  select(tool: Tool): void {
    this.#tool = tool;
    elements<HTMLElement>(".tool").forEach(button => button.classList.toggle("active", button.dataset.tool === tool));
    this.documentModel.overlay.style.cursor = tool === "eraser" ? "cell" : "crosshair";
    if (tool !== "crop") {
      this.#crop = null;
      this.#applyCrop.classList.add("hidden");
      this.documentModel.clearOverlay();
    }
  }

  selectFromShortcut(key: string): boolean {
    const tool = TOOL_SHORTCUTS[key.toLowerCase()];
    if (!tool) return false;
    this.select(tool);
    return true;
  }

  private bindEvents(): void {
    const overlay = this.documentModel.overlay;
    overlay.addEventListener("pointerdown", event => this.onPointerDown(event));
    overlay.addEventListener("pointermove", event => this.onPointerMove(event));
    overlay.addEventListener("pointerup", event => this.onPointerUp(event));
    elements<HTMLElement>(".tool").forEach(button => button.addEventListener("click", () => this.select(button.dataset.tool as Tool)));
    this.#applyCrop.addEventListener("click", () => {
      if (!this.#crop) return;
      this.documentModel.crop(this.#crop);
      this.#crop = null;
      this.#applyCrop.classList.add("hidden");
    });
    this.#size.addEventListener("input", () => { element("#sizeValue").textContent = `${this.#size.value} px`; });
  }

  private point(event: PointerEvent): Point {
    return canvasPoint(event, this.documentModel.overlay.getBoundingClientRect(), this.documentModel.width, this.documentModel.height);
  }

  private configure(context: CanvasRenderingContext2D): void {
    configureStroke(context, { color: this.#color.value, size: Number(this.#size.value) });
  }

  private drawShape(context: CanvasRenderingContext2D, from: Point, to: Point): void {
    this.configure(context);
    drawShape(context, this.#tool, from, to, this.#fill.checked);
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.documentModel.hasImage) return;
    const point = this.point(event);
    if (this.#tool === "picker") {
      const pixel = this.documentModel.context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
      this.#color.value = `#${[pixel[0], pixel[1], pixel[2]].map(value => value!.toString(16).padStart(2, "0")).join("")}`;
      return;
    }
    this.#drawing = true;
    this.#start = this.#last = point;
    this.documentModel.overlay.setPointerCapture(event.pointerId);
    if (this.#tool === "brush" || this.#tool === "eraser") this.drawStroke(point, { x: point.x + .01, y: point.y + .01 });
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.#drawing) return;
    const point = this.point(event);
    if (this.#tool === "brush" || this.#tool === "eraser") {
      this.drawStroke(this.#last, point); this.#last = point;
    } else {
      this.documentModel.clearOverlay(); this.drawShape(this.documentModel.overlayContext, this.#start, point);
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.#drawing) return;
    this.#drawing = false;
    const point = this.point(event);
    this.documentModel.context.globalCompositeOperation = "source-over";
    if (SHAPE_TOOLS.includes(this.#tool)) {
      this.documentModel.clearOverlay(); this.drawShape(this.documentModel.context, this.#start, point); this.documentModel.commit();
    } else if (this.#tool === "crop") {
      this.#crop = {
        x: Math.round(Math.min(this.#start.x, point.x)), y: Math.round(Math.min(this.#start.y, point.y)),
        width: Math.round(Math.abs(point.x - this.#start.x)), height: Math.round(Math.abs(point.y - this.#start.y))
      };
      this.#applyCrop.classList.toggle("hidden", this.#crop.width < 1 || this.#crop.height < 1);
    } else this.documentModel.commit();
  }

  private drawStroke(from: Point, to: Point): void {
    const context = this.documentModel.context;
    this.configure(context);
    context.globalCompositeOperation = this.#tool === "eraser" ? "destination-out" : "source-over";
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
  }
}
