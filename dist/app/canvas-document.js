import { canvasContext, element } from "./dom.js";
const HISTORY_LIMIT = 30;
export class CanvasDocument {
    canvas = element("#canvas");
    overlay = element("#overlay");
    context = canvasContext(this.canvas, { willReadFrequently: true });
    overlayContext = canvasContext(this.overlay);
    hasImage = false;
    fileHandle = null;
    baseName = "little-image";
    savedType = "image/png";
    #history = [];
    #historyIndex = -1;
    #historyListeners = new Set();
    #documentListeners = new Set();
    get width() { return this.canvas.width; }
    get height() { return this.canvas.height; }
    onHistoryChange(listener) {
        this.#historyListeners.add(listener);
        listener(this.#historyIndex > 0, this.#historyIndex < this.#history.length - 1);
    }
    onDocumentChange(listener) {
        this.#documentListeners.add(listener);
        listener(this.hasImage);
    }
    setSize(width, height) {
        this.canvas.width = this.overlay.width = width;
        this.canvas.height = this.overlay.height = height;
        element("#dimensions").textContent = `${width} × ${height} px`;
        element("#widthInput").value = String(width);
        element("#heightInput").value = String(height);
    }
    async load(file) {
        if (!file.type.startsWith("image/"))
            return;
        const bitmap = await createImageBitmap(file);
        this.setSize(bitmap.width, bitmap.height);
        this.context.clearRect(0, 0, this.width, this.height);
        this.context.drawImage(bitmap, 0, 0);
        bitmap.close();
        this.activate(file.name.replace(/\.[^.]+$/, "") || "little-image");
    }
    create(options) {
        this.setSize(options.width, options.height);
        this.context.clearRect(0, 0, options.width, options.height);
        if (!options.transparent) {
            this.context.fillStyle = options.background;
            this.context.fillRect(0, 0, options.width, options.height);
        }
        this.savedType = "image/png";
        element("#formatSelect").value = this.savedType;
        this.activate(options.name || "untitled");
    }
    activate(name) {
        this.hasImage = true;
        this.fileHandle = null;
        this.baseName = name;
        this.#history = [];
        this.#historyIndex = -1;
        element("#emptyState").classList.add("hidden");
        element("#canvasWrap").classList.remove("hidden");
        this.clearOverlay();
        this.commit();
        this.#documentListeners.forEach(listener => listener(true));
    }
    commit() {
        if (!this.hasImage && this.#history.length > 0)
            return;
        this.#history.splice(this.#historyIndex + 1);
        this.#history.push(this.context.getImageData(0, 0, this.width, this.height));
        if (this.#history.length > HISTORY_LIMIT)
            this.#history.shift();
        this.#historyIndex = this.#history.length - 1;
        this.#emitHistory();
    }
    undo() { this.#restore(this.#historyIndex - 1); }
    redo() { this.#restore(this.#historyIndex + 1); }
    clearOverlay() {
        this.overlayContext.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
    crop(rect) {
        if (rect.width < 1 || rect.height < 1)
            return;
        const image = this.context.getImageData(rect.x, rect.y, rect.width, rect.height);
        this.setSize(image.width, image.height);
        this.context.putImageData(image, 0, 0);
        this.clearOverlay();
        this.commit();
    }
    resize(width, height) {
        if (!this.hasImage || width < 1 || height < 1)
            return;
        const source = this.copyCanvas();
        this.setSize(Math.round(width), Math.round(height));
        this.context.imageSmoothingEnabled = true;
        this.context.imageSmoothingQuality = "high";
        this.context.drawImage(source, 0, 0, this.width, this.height);
        this.commit();
    }
    transform(rotation, flipX = 1, flipY = 1) {
        if (!this.hasImage)
            return;
        const source = this.copyCanvas();
        const swap = Math.abs(rotation) % 180 === 90;
        this.setSize(swap ? source.height : source.width, swap ? source.width : source.height);
        this.context.save();
        this.context.translate(this.width / 2, this.height / 2);
        this.context.rotate(rotation * Math.PI / 180);
        this.context.scale(flipX, flipY);
        this.context.drawImage(source, -source.width / 2, -source.height / 2);
        this.context.restore();
        this.commit();
    }
    containsTransparency() {
        const pixels = this.context.getImageData(0, 0, this.width, this.height).data;
        for (let index = 3; index < pixels.length; index += 4)
            if (pixels[index] < 255)
                return true;
        return false;
    }
    async toBlob(type) {
        const output = document.createElement("canvas");
        output.width = this.width;
        output.height = this.height;
        const context = canvasContext(output);
        if (type === "image/jpeg") {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, output.width, output.height);
        }
        context.drawImage(this.canvas, 0, 0);
        return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image encoding failed")), type, .92));
    }
    copyCanvas() {
        const copy = document.createElement("canvas");
        copy.width = this.width;
        copy.height = this.height;
        canvasContext(copy).drawImage(this.canvas, 0, 0);
        return copy;
    }
    #restore(index) {
        const state = this.#history[index];
        if (!state)
            return;
        this.setSize(state.width, state.height);
        this.context.putImageData(state, 0, 0);
        this.#historyIndex = index;
        this.clearOverlay();
        this.#emitHistory();
    }
    #emitHistory() {
        const canUndo = this.#historyIndex > 0;
        const canRedo = this.#historyIndex < this.#history.length - 1;
        this.#historyListeners.forEach(listener => listener(canUndo, canRedo));
    }
}
