import { DEFAULT_IMAGE_FORMAT, IMAGE_FORMATS, imageFormat } from "../models/imageFormats";

export function populateImageFormatSelect(select: HTMLSelectElement, selected = DEFAULT_IMAGE_FORMAT.mimeType): void {
  select.replaceChildren(...IMAGE_FORMATS.map(format => new Option(format.label, format.mimeType)));
  select.value = imageFormat(selected).mimeType;
}

export function transparencyWarning(formatValue: string): string {
  const format = imageFormat(formatValue);
  if (format.supportsTransparency) return `${format.label} preserves transparent pixels.`;
  return `${format.label} does not support transparency. Transparent pixels will be replaced with white when saved or exported.`;
}
