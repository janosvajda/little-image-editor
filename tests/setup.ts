import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, vi } from "vitest";

class TestImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth; this.height = widthOrHeight; this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth; this.width = widthOrHeight; this.height = height!;
    }
  }
}

const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

function contextFor(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const existing = contexts.get(canvas);
  if (existing) return existing;
  let pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255);
  const context = {
    canvas, fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
    globalCompositeOperation: "source-over", imageSmoothingEnabled: true, imageSmoothingQuality: "low",
    clearRect: vi.fn(() => { pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4); }),
    fillRect: vi.fn(() => { pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255); }),
    drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), rect: vi.fn(), ellipse: vi.fn(), setLineDash: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    getImageData: vi.fn((x: number, y: number, width: number, height: number) => new TestImageData(pixels.slice(0, width * height * 4), width, height)),
    putImageData: vi.fn((image: ImageData) => { pixels = new Uint8ClampedArray(image.data); })
  } as unknown as CanvasRenderingContext2D;
  contexts.set(canvas, context);
  return context;
}

Object.defineProperty(globalThis, "ImageData", { value: TestImageData, configurable: true });
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function () { return contextFor(this); }, configurable: true });
Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", { value: function (callback: BlobCallback, type?: string) { callback(new Blob(["image"], { type })); }, configurable: true });
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: function () { this.setAttribute("open", ""); }, configurable: true });
Object.defineProperty(HTMLDialogElement.prototype, "close", { value: function () { this.removeAttribute("open"); }, configurable: true });
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { value: vi.fn(), configurable: true });
Object.defineProperty(HTMLAnchorElement.prototype, "click", { value: vi.fn(), configurable: true });

beforeEach(() => {
  const html = readFileSync(resolve("src/editor.html"), "utf8").replace(/<script[\s\S]*?<\/script>/, "");
  document.open(); document.write(html); document.close();
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({ matches: query.includes("light"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: vi.fn().mockResolvedValue({ width: 20, height: 10, close: vi.fn() }) });
});
