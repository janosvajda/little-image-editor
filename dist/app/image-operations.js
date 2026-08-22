import { element, elements } from "./dom.js";
export class ImageOperations {
    documentModel;
    #filters = elements("[data-filter]");
    #adjustmentBase = null;
    constructor(documentModel) {
        this.documentModel = documentModel;
        this.bindEvents();
    }
    resetControls() {
        this.#filters.forEach(input => { input.value = "0"; this.updateLabel(input); });
    }
    bindEvents() {
        this.#filters.forEach(input => {
            input.addEventListener("input", () => { this.updateLabel(input); this.previewAdjustments(); });
            input.addEventListener("change", () => {
                if (!this.#adjustmentBase)
                    return;
                this.documentModel.commit();
                this.#adjustmentBase = null;
                this.resetControls();
            });
        });
        elements("[data-effect]").forEach(button => button.addEventListener("click", () => this.applyEffect(button.dataset.effect)));
        element("#resetFiltersButton").addEventListener("click", () => {
            if (this.#adjustmentBase)
                this.documentModel.context.putImageData(this.#adjustmentBase, 0, 0);
            this.#adjustmentBase = null;
            this.resetControls();
        });
        element("#rotateLeftButton").addEventListener("click", () => this.documentModel.transform(-90));
        element("#rotateRightButton").addEventListener("click", () => this.documentModel.transform(90));
        element("#flipHButton").addEventListener("click", () => this.documentModel.transform(0, -1, 1));
        element("#flipVButton").addEventListener("click", () => this.documentModel.transform(0, 1, -1));
        element("#resizeButton").addEventListener("click", () => this.documentModel.resize(Number(element("#widthInput").value), Number(element("#heightInput").value)));
        this.documentModel.onHistoryChange(() => { this.#adjustmentBase = null; this.resetControls(); });
    }
    updateLabel(input) {
        const label = document.querySelector(`#${input.dataset.filter}Value`);
        if (label)
            label.textContent = input.value;
    }
    previewAdjustments() {
        if (!this.documentModel.hasImage)
            return;
        const { context, width, height } = this.documentModel;
        this.#adjustmentBase ??= context.getImageData(0, 0, width, height);
        const result = new ImageData(new Uint8ClampedArray(this.#adjustmentBase.data), width, height);
        const value = (name) => Number(this.#filters.find(input => input.dataset.filter === name)?.value ?? 0);
        const brightness = value("brightness") * 2.55;
        const contrastValue = value("contrast");
        const contrast = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
        const saturation = 1 + value("saturation") / 100;
        for (let index = 0; index < result.data.length; index += 4) {
            let red = result.data[index] + brightness;
            let green = result.data[index + 1] + brightness;
            let blue = result.data[index + 2] + brightness;
            red = contrast * (red - 128) + 128;
            green = contrast * (green - 128) + 128;
            blue = contrast * (blue - 128) + 128;
            const gray = .299 * red + .587 * green + .114 * blue;
            result.data[index] = gray + saturation * (red - gray);
            result.data[index + 1] = gray + saturation * (green - gray);
            result.data[index + 2] = gray + saturation * (blue - gray);
        }
        context.putImageData(result, 0, 0);
    }
    applyEffect(effect) {
        if (!this.documentModel.hasImage)
            return;
        const { context, width, height } = this.documentModel;
        const image = context.getImageData(0, 0, width, height);
        const { data } = image;
        if (effect === "sharpen") {
            const source = new Uint8ClampedArray(data);
            for (let y = 1; y < height - 1; y++)
                for (let x = 1; x < width - 1; x++)
                    for (let channel = 0; channel < 3; channel++) {
                        const index = (y * width + x) * 4 + channel;
                        data[index] = 5 * source[index] - source[index - 4] - source[index + 4] - source[index - width * 4] - source[index + width * 4];
                    }
        }
        else {
            for (let index = 0; index < data.length; index += 4) {
                const red = data[index], green = data[index + 1], blue = data[index + 2];
                if (effect === "grayscale")
                    data[index] = data[index + 1] = data[index + 2] = .299 * red + .587 * green + .114 * blue;
                if (effect === "invert") {
                    data[index] = 255 - red;
                    data[index + 1] = 255 - green;
                    data[index + 2] = 255 - blue;
                }
                if (effect === "sepia") {
                    data[index] = .393 * red + .769 * green + .189 * blue;
                    data[index + 1] = .349 * red + .686 * green + .168 * blue;
                    data[index + 2] = .272 * red + .534 * green + .131 * blue;
                }
            }
        }
        context.putImageData(image, 0, 0);
        this.documentModel.commit();
    }
}
