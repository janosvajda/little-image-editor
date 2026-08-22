import type { ImageFormat } from "./appTypes";

export interface ImageFormatDefinition {
  readonly mimeType: ImageFormat;
  readonly label: string;
  readonly extensions: readonly string[];
  readonly supportsTransparency: boolean;
  readonly quality?: number;
}

export const IMAGE_FORMATS: readonly ImageFormatDefinition[] = [
  { mimeType: "image/png", label: "PNG", extensions: ["png"], supportsTransparency: true },
  { mimeType: "image/jpeg", label: "JPEG", extensions: ["jpg", "jpeg"], supportsTransparency: false, quality: .92 },
  { mimeType: "image/webp", label: "WebP", extensions: ["webp"], supportsTransparency: true, quality: .92 }
];

export const DEFAULT_IMAGE_FORMAT = IMAGE_FORMATS[0]!;

export function imageFormat(mimeType: ImageFormat): ImageFormatDefinition {
  return IMAGE_FORMATS.find(format => format.mimeType === mimeType) ?? DEFAULT_IMAGE_FORMAT;
}
