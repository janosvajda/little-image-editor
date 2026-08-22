import { element } from "./dom.js";
export class SpriteController {
    documentModel;
    dialog = element("#functionsDialog");
    #input = element("#spriteInput");
    #frames = [];
    constructor(documentModel) {
        this.documentModel = documentModel;
        element("#functionsButton").addEventListener("click", () => this.dialog.showModal());
        element("#addSpriteButton").addEventListener("click", () => this.#input.click());
        this.#input.addEventListener("change", () => { if (this.#input.files)
            void this.queue(this.#input.files); });
        element("#buildSpriteButton").addEventListener("click", () => this.build());
    }
    async queue(files) {
        const frames = await Promise.all([...files].filter(file => file.type.startsWith("image/")).map(file => createImageBitmap(file)));
        this.#frames.push(...frames);
        element("#spriteCount").textContent = String(this.#frames.length);
    }
    build() {
        if (!this.#frames.length)
            return;
        const columns = Math.max(1, Number(element("#spriteColumns").value));
        const padding = Math.max(0, Number(element("#spritePadding").value));
        const cellWidth = Math.max(...this.#frames.map(frame => frame.width));
        const cellHeight = Math.max(...this.#frames.map(frame => frame.height));
        const rows = Math.ceil(this.#frames.length / columns);
        this.documentModel.setSize(columns * cellWidth + (columns - 1) * padding, rows * cellHeight + (rows - 1) * padding);
        this.documentModel.context.clearRect(0, 0, this.documentModel.width, this.documentModel.height);
        this.#frames.forEach((frame, index) => this.documentModel.context.drawImage(frame, (index % columns) * (cellWidth + padding), Math.floor(index / columns) * (cellHeight + padding)));
        this.documentModel.activate("sprite-sheet");
        this.dialog.close();
    }
}
