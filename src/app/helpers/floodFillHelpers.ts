export interface FloodFillOptions {
  readonly color: string;
  readonly opacity: number;
  readonly tolerance: number;
}

export function floodFill(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  startX: number,
  startY: number,
  options: FloodFillOptions
): boolean {
  if (width <= 0 || height <= 0 || startX < 0 || startY < 0 || startX >= width || startY >= height) return false;
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const startIndex = (startY * width + startX) * 4;
  const target = [pixels[startIndex]!, pixels[startIndex + 1]!, pixels[startIndex + 2]!, pixels[startIndex + 3]!] as const;
  const source = parseHexColor(options.color);
  const opacity = clamp(options.opacity, 0, 1);
  const tolerance = clamp(Math.round(options.tolerance), 0, 255);
  const replacement = composite(source, opacity, target);
  if (replacement.every((value, index) => value === target[index])) return false;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [startX, startY];
  let changed = false;
  const matches = (x: number, y: number): boolean => {
    const pixel = y * width + x;
    if (visited[pixel]) return false;
    const index = pixel * 4;
    if (target[3] === 0 && pixels[index + 3] === 0) return true;
    return Math.max(
      Math.abs(pixels[index]! - target[0]), Math.abs(pixels[index + 1]! - target[1]),
      Math.abs(pixels[index + 2]! - target[2]), Math.abs(pixels[index + 3]! - target[3])
    ) <= tolerance;
  };

  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    let scanY = y;
    while (scanY >= 0 && matches(x, scanY)) scanY -= 1;
    scanY += 1;
    let reachesLeft = false, reachesRight = false;
    for (; scanY < height && matches(x, scanY); scanY += 1) {
      const pixel = scanY * width + x, index = pixel * 4;
      visited[pixel] = 1;
      const output = composite(source, opacity, [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!]);
      pixels.set(output, index); changed = true;
      if (x > 0) {
        if (matches(x - 1, scanY)) { if (!reachesLeft) stack.push(x - 1, scanY); reachesLeft = true; }
        else reachesLeft = false;
      }
      if (x < width - 1) {
        if (matches(x + 1, scanY)) { if (!reachesRight) stack.push(x + 1, scanY); reachesRight = true; }
        else reachesRight = false;
      }
    }
  }
  if (changed) context.putImageData(image, 0, 0);
  return changed;
}

function parseHexColor(color: string): readonly [number, number, number] {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  return match ? [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16)] : [0, 0, 0];
}

function composite(source: readonly [number, number, number], opacity: number, destination: readonly number[]): Uint8ClampedArray {
  const destinationAlpha = destination[3]! / 255;
  const outputAlpha = opacity + destinationAlpha * (1 - opacity);
  if (outputAlpha <= 0) return new Uint8ClampedArray([0, 0, 0, 0]);
  return new Uint8ClampedArray([
    (source[0] * opacity + destination[0]! * destinationAlpha * (1 - opacity)) / outputAlpha,
    (source[1] * opacity + destination[1]! * destinationAlpha * (1 - opacity)) / outputAlpha,
    (source[2] * opacity + destination[2]! * destinationAlpha * (1 - opacity)) / outputAlpha,
    outputAlpha * 255
  ]);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
