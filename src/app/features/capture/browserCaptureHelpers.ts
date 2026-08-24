import type {
	CaptureRect,
	CaptureViewport,
} from '../../core/document/browserCapture';

const CAPTURE_SCALE_TOLERANCE = 0.02;

export interface CaptureDisplaySize {
	width: number;
	height: number;
}

export function scaledCaptureRect(
	crop: CaptureRect,
	viewport: CaptureViewport,
	bitmapWidth: number,
	bitmapHeight: number,
): CaptureRect | null {
	if (
		viewport.width <= 0 ||
		viewport.height <= 0 ||
		bitmapWidth <= 0 ||
		bitmapHeight <= 0
	)
		return null;
	const left = clamp(
		Math.round((crop.x * bitmapWidth) / viewport.width),
		0,
		bitmapWidth,
	);
	const top = clamp(
		Math.round((crop.y * bitmapHeight) / viewport.height),
		0,
		bitmapHeight,
	);
	const right = clamp(
		Math.round(((crop.x + crop.width) * bitmapWidth) / viewport.width),
		left,
		bitmapWidth,
	);
	const bottom = clamp(
		Math.round(((crop.y + crop.height) * bitmapHeight) / viewport.height),
		top,
		bitmapHeight,
	);
	return right > left && bottom > top
		? { x: left, y: top, width: right - left, height: bottom - top }
		: null;
}

export function captureFileName(
	kind: 'image' | 'page' | 'region' | 'bug-report',
	now = new Date(),
): string {
	const timestamp = now.toISOString().replace(/[:.]/g, '-');
	return `${kind}-capture-${timestamp}.png`;
}

/**
 * Chrome screenshots use device pixels while page geometry uses CSS pixels.
 * Bug-report captures are normalized only when both axes prove the bitmap is a
 * uniformly scaled HiDPI representation of the captured viewport.
 */
export function highDensityCaptureDisplaySize(
	viewport: CaptureViewport,
	bitmapWidth: number,
	bitmapHeight: number,
): CaptureDisplaySize | null {
	const width = Math.round(viewport.width),
		height = Math.round(viewport.height);
	if (width < 1 || height < 1 || bitmapWidth <= width || bitmapHeight <= height)
		return null;
	const horizontalScale = bitmapWidth / width,
		verticalScale = bitmapHeight / height;
	const scaleDifference =
		Math.abs(horizontalScale - verticalScale) /
		Math.max(horizontalScale, verticalScale);
	return scaleDifference <= CAPTURE_SCALE_TOLERANCE ? { width, height } : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}
