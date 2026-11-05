/**
 * The animation file as a file: its name, its media type and the identity
 * written inside it. `docs/animation-format.md` describes its content.
 */

/** The `format` field every animation file carries. */
export const ANIMATION_FORMAT_ID = 'little-animation';
/** The format version this editor writes; readers reject versions whose major number they do not know. */
export const ANIMATION_FORMAT_VERSION = 1;
export const ANIMATION_EXTENSION = 'anim.json';
/** An animation file is JSON. */
export const ANIMATION_MIME_TYPE = 'application/json';
/**
 * How the editor's file type lists tell an animation apart from the image
 * formats, which they name by their media types; JSON alone would not say
 * the file is an animation.
 */
export const ANIMATION_FILE_TYPE = 'application/vnd.little-animation+json';
const ANIMATION_SUFFIX = `.${ANIMATION_EXTENSION}`;

export function isAnimationFileName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(ANIMATION_SUFFIX);
}

/** Whether a file is an animation: by its name, as JSON's type cannot tell. */
export function isAnimationFile(file: Pick<File, 'name'>): boolean {
	return isAnimationFileName(file.name);
}

/** A name with the animation file's double extension, any other extension replaced. */
export function animationFileName(name: string): string {
	const trimmed = name.trim();
	if (isAnimationFileName(trimmed)) return trimmed;
	return `${trimmed.replace(/\.[^.]+$/, '')}${ANIMATION_SUFFIX}`;
}

/** The name of a document saved as `fileName`, without the animation extension. */
export function animationBaseName(fileName: string): string {
	return isAnimationFileName(fileName) ? fileName.slice(0, -ANIMATION_SUFFIX.length) : fileName;
}

/** Decimal places numbers are written with, so saving the same animation always writes the same bytes. */
export const FILE_NUMBER_PRECISION = 6;

/** A number as files write it: rounded to `FILE_NUMBER_PRECISION` places, without a negative zero. */
export function roundFileNumber(value: number): number {
	const rounded = Number(value.toFixed(FILE_NUMBER_PRECISION));
	return rounded === 0 ? 0 : rounded;
}
