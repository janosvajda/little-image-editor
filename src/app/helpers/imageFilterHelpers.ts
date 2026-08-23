export type ColorEffect = "monochrome" | "sepia" | "invert";

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

export function applyColorEffect(image: ImageData, effect: ColorEffect, amount = 1): void {
  const { data } = image;
  const mix = Math.max(0, Math.min(1, amount));
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]!, green = data[index + 1]!, blue = data[index + 2]!;
    let outputRed = red, outputGreen = green, outputBlue = blue;
    if (effect === "monochrome") outputRed = outputGreen = outputBlue = .299 * red + .587 * green + .114 * blue;
    if (effect === "invert") { outputRed = 255 - red; outputGreen = 255 - green; outputBlue = 255 - blue; }
    if (effect === "sepia") { outputRed = .393*red+.769*green+.189*blue; outputGreen = .349*red+.686*green+.168*blue; outputBlue = .272*red+.534*green+.131*blue; }
    data[index] = red + (outputRed - red) * mix;
    data[index + 1] = green + (outputGreen - green) * mix;
    data[index + 2] = blue + (outputBlue - blue) * mix;
  }
}

export function applySharpen(image: ImageData, strength = 1): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data);
  const amount = Math.max(0, strength);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) for (let channel = 0; channel < 3; channel++) {
    const index = (y * width + x) * 4 + channel;
    data[index] = (1 + 4 * amount) * source[index]! - amount * (source[index - 4]! + source[index + 4]! + source[index - width * 4]! + source[index + width * 4]!);
  }
}
