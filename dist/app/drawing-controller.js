import { element, elements } from "./dom.js";
const SHAPE_TOOLS = ["line", "rectangle", "ellipse"];
const TOOL_SHORTCUTS = { b: "brush", e: "eraser", l: "line", r: "rectangle", o: "ellipse", i: "picker", c: "crop" };
export class DrawingController {
    documentModel;
    #color = element("#colorInput");
    #size = element("#sizeInput");
    #fill = element("#fillInput");
    #applyCrop = element("#applyCropButton");
    #tool = "brush";
    #drawing = false;
    #start = { x: 0, y: 0 };
    #last = { x: 0, y: 0 };
    #crop = null;
    constructor(documentModel) {
        this.documentModel = documentModel;
        this.bindEvents();
    }
    setInitialColor(theme) {
        this.#color.value = theme === "light" ? "#000000" : "#ffffff";
    }
    select(tool) {
        this.#tool = tool;
        elements(".tool").forEach(button => button.classList.toggle("active", button.dataset.tool === tool));
        this.documentModel.overlay.style.cursor = tool === "eraser" ? "cell" : "crosshair";
        if (tool !== "crop") {
            this.#crop = null;
            this.#applyCrop.classList.add("hidden");
            this.documentModel.clearOverlay();
        }
    }
    selectFromShortcut(key) {
        const tool = TOOL_SHORTCUTS[key.toLowerCase()];
        if (!tool)
            return false;
        this.select(tool);
        return true;
    }
    bindEvents() {
        const overlay = this.documentModel.overlay;
        overlay.addEventListener("pointerdown", event => this.onPointerDown(event));
        overlay.addEventListener("pointermove", event => this.onPointerMove(event));
        overlay.addEventListener("pointerup", event => this.onPointerUp(event));
        elements(".tool").forEach(button => button.addEventListener("click", () => this.select(button.dataset.tool)));
        this.#applyCrop.addEventListener("click", () => {
            if (!this.#crop)
                return;
            this.documentModel.crop(this.#crop);
            this.#crop = null;
            this.#applyCrop.classList.add("hidden");
        });
        this.#size.addEventListener("input", () => { element("#sizeValue").textContent = `${this.#size.value} px`; });
    }
    point(event) {
        const bounds = this.documentModel.overlay.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(this.documentModel.width, (event.clientX - bounds.left) * this.documentModel.width / bounds.width)),
            y: Math.max(0, Math.min(this.documentModel.height, (event.clientY - bounds.top) * this.documentModel.height / bounds.height))
        };
    }
    configure(context) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = Number(this.#size.value);
        context.strokeStyle = this.#color.value;
        context.fillStyle = this.#color.value;
    }
    drawShape(context, from, to) {
        this.configure(context);
        context.beginPath();
        if (this.#tool === "line") {
            context.moveTo(from.x, from.y);
            context.lineTo(to.x, to.y);
        }
        else if (this.#tool === "rectangle" || this.#tool === "crop")
            context.rect(from.x, from.y, to.x - from.x, to.y - from.y);
        else if (this.#tool === "ellipse")
            context.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
        if (this.#tool === "crop") {
            context.strokeStyle = "#ffffff";
            context.lineWidth = 1;
            context.setLineDash([6, 4]);
            context.stroke();
            context.setLineDash([]);
        }
        else if (this.#fill.checked && this.#tool !== "line")
            context.fill();
        else
            context.stroke();
    }
    onPointerDown(event) {
        if (!this.documentModel.hasImage)
            return;
        const point = this.point(event);
        if (this.#tool === "picker") {
            const pixel = this.documentModel.context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
            this.#color.value = `#${[pixel[0], pixel[1], pixel[2]].map(value => value.toString(16).padStart(2, "0")).join("")}`;
            return;
        }
        this.#drawing = true;
        this.#start = this.#last = point;
        this.documentModel.overlay.setPointerCapture(event.pointerId);
        if (this.#tool === "brush" || this.#tool === "eraser")
            this.drawStroke(point, { x: point.x + .01, y: point.y + .01 });
    }
    onPointerMove(event) {
        if (!this.#drawing)
            return;
        const point = this.point(event);
        if (this.#tool === "brush" || this.#tool === "eraser") {
            this.drawStroke(this.#last, point);
            this.#last = point;
        }
        else {
            this.documentModel.clearOverlay();
            this.drawShape(this.documentModel.overlayContext, this.#start, point);
        }
    }
    onPointerUp(event) {
        if (!this.#drawing)
            return;
        this.#drawing = false;
        const point = this.point(event);
        this.documentModel.context.globalCompositeOperation = "source-over";
        if (SHAPE_TOOLS.includes(this.#tool)) {
            this.documentModel.clearOverlay();
            this.drawShape(this.documentModel.context, this.#start, point);
            this.documentModel.commit();
        }
        else if (this.#tool === "crop") {
            this.#crop = {
                x: Math.round(Math.min(this.#start.x, point.x)), y: Math.round(Math.min(this.#start.y, point.y)),
                width: Math.round(Math.abs(point.x - this.#start.x)), height: Math.round(Math.abs(point.y - this.#start.y))
            };
            this.#applyCrop.classList.toggle("hidden", this.#crop.width < 1 || this.#crop.height < 1);
        }
        else
            this.documentModel.commit();
    }
    drawStroke(from, to) {
        const context = this.documentModel.context;
        this.configure(context);
        context.globalCompositeOperation = this.#tool === "eraser" ? "destination-out" : "source-over";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
    }
}
