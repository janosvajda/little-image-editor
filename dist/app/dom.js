export function element(selector, root = document) {
    const value = root.querySelector(selector);
    if (!value)
        throw new Error(`Required element not found: ${selector}`);
    return value;
}
export function elements(selector, root = document) {
    return [...root.querySelectorAll(selector)];
}
export function canvasContext(canvas, options) {
    const context = canvas.getContext("2d", options);
    if (!context)
        throw new Error("Canvas 2D is not supported by this browser");
    return context;
}
