export type ColorEffect = "grayscale" | "sepia" | "invert";

export interface ToneAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

export function applyToneAdjustments(image: ImageData, adjustments: ToneAdjustments): ImageData {
  const result = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const brightness = adjustments.brightness * 2.55;
  const contrast = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
  const saturation = 1 + adjustments.saturation / 100;
  for (let index = 0; index < result.data.length; index += 4) {
    let red = result.data[index]! + brightness;
    let green = result.data[index + 1]! + brightness;
    let blue = result.data[index + 2]! + brightness;
    red = contrast * (red - 128) + 128;
    green = contrast * (green - 128) + 128;
    blue = contrast * (blue - 128) + 128;
    const gray = .299 * red + .587 * green + .114 * blue;
    result.data[index] = gray + saturation * (red - gray);
    result.data[index + 1] = gray + saturation * (green - gray);
    result.data[index + 2] = gray + saturation * (blue - gray);
  }
  return result;
}

export function applyColorEffect(image: ImageData, effect: ColorEffect): void {
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]!, green = data[index + 1]!, blue = data[index + 2]!;
    if (effect === "grayscale") data[index] = data[index + 1] = data[index + 2] = .299 * red + .587 * green + .114 * blue;
    if (effect === "invert") { data[index] = 255 - red; data[index + 1] = 255 - green; data[index + 2] = 255 - blue; }
    if (effect === "sepia") { data[index] = .393*red+.769*green+.189*blue; data[index+1] = .349*red+.686*green+.168*blue; data[index+2] = .272*red+.534*green+.131*blue; }
  }
}

export function applySharpen(image: ImageData): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) for (let channel = 0; channel < 3; channel++) {
    const index = (y * width + x) * 4 + channel;
    data[index] = 5 * source[index]! - source[index - 4]! - source[index + 4]! - source[index - width * 4]! - source[index + width * 4]!;
  }
}
