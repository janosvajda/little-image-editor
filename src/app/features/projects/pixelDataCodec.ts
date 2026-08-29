const BYTE_CHUNK_SIZE = 0x8000;
const PACK_BITS_MAXIMUM_LENGTH = 128;
const PACK_BITS_RUN_THRESHOLD = 3;
const PACK_BITS_RUN_FLAG = 0x80;
const BASE64_INPUT_GROUP_SIZE = 3;
const BASE64_OUTPUT_GROUP_SIZE = 4;
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

const PixelEncodingPrefix = {
	RunLength: 'rle:',
	DocumentReference: 'ref:document',
	HistoryReference: 'ref:history:',
} as const;

export type PixelReference =
	| { readonly kind: 'document' }
	| { readonly kind: 'history'; readonly index: number };

interface RegisteredPixelBuffer {
	readonly pixels: Uint8ClampedArray;
	readonly reference: PixelReference;
}

export class PixelBufferRegistry {
	readonly #buffers = new Map<number, RegisteredPixelBuffer[]>();

	register(
		pixels: Uint8ClampedArray,
		reference: PixelReference,
	): PixelReference | null {
		const fingerprint = pixelFingerprint(pixels);
		const candidates = this.#buffers.get(fingerprint) ?? [];
		const existing = candidates.find((candidate) =>
			pixelBytesEqual(candidate.pixels, pixels),
		);
		if (existing) return existing.reference;
		candidates.push({ pixels, reference });
		this.#buffers.set(fingerprint, candidates);
		return null;
	}
}

export function encodePixelBytes(pixels: Uint8ClampedArray): string {
	const runLengthBytes = encodePackBits(pixels);
	const rawLength = base64Length(pixels.length);
	const runLengthLength =
		PixelEncodingPrefix.RunLength.length + base64Length(runLengthBytes.length);
	return runLengthLength < rawLength
		? `${PixelEncodingPrefix.RunLength}${bytesToBase64(runLengthBytes)}`
		: bytesToBase64(pixels);
}

export function decodePixelBytes(encoded: string): Uint8ClampedArray {
	if (encoded.startsWith(PixelEncodingPrefix.RunLength))
		return decodePackBits(
			base64ToBytes(encoded.slice(PixelEncodingPrefix.RunLength.length)),
		);
	return base64ToBytes(encoded);
}

export function encodePixelReference(reference: PixelReference): string {
	return reference.kind === 'document'
		? PixelEncodingPrefix.DocumentReference
		: `${PixelEncodingPrefix.HistoryReference}${reference.index}`;
}

export function decodePixelReference(encoded: string): PixelReference | null {
	if (encoded === PixelEncodingPrefix.DocumentReference)
		return { kind: 'document' };
	if (!encoded.startsWith(PixelEncodingPrefix.HistoryReference)) return null;
	const index = Number(encoded.slice(PixelEncodingPrefix.HistoryReference.length));
	return Number.isSafeInteger(index) && index >= 0
		? { kind: 'history', index }
		: null;
}

function encodePackBits(source: Uint8ClampedArray): Uint8Array {
	const encoded: number[] = [];
	let index = 0;
	while (index < source.length) {
		const runLength = repeatedByteCount(source, index);
		if (runLength >= PACK_BITS_RUN_THRESHOLD) {
			encoded.push(PACK_BITS_RUN_FLAG | (runLength - 1), source[index]!);
			index += runLength;
			continue;
		}
		const literalStart = index;
		index += runLength;
		while (
			index < source.length &&
			index - literalStart < PACK_BITS_MAXIMUM_LENGTH
		) {
			const nextRunLength = repeatedByteCount(source, index);
			if (nextRunLength >= PACK_BITS_RUN_THRESHOLD) break;
			index += nextRunLength;
		}
		const literalLength = index - literalStart;
		encoded.push(literalLength - 1);
		for (let offset = literalStart; offset < index; offset += 1)
			encoded.push(source[offset]!);
	}
	return Uint8Array.from(encoded);
}

function repeatedByteCount(source: Uint8ClampedArray, start: number): number {
	const value = source[start];
	let length = 1;
	while (
		length < PACK_BITS_MAXIMUM_LENGTH &&
		start + length < source.length &&
		source[start + length] === value
	)
		length += 1;
	return length;
}

function decodePackBits(source: Uint8ClampedArray): Uint8ClampedArray {
	const decoded = new Uint8ClampedArray(decodedPackBitsLength(source));
	let outputOffset = 0;
	for (let index = 0; index < source.length; ) {
		const control = source[index++]!;
		const length = (control & 0x7f) + 1;
		if ((control & PACK_BITS_RUN_FLAG) !== 0) {
			const value = source[index++]!;
			decoded.fill(value, outputOffset, outputOffset + length);
			outputOffset += length;
			continue;
		}
		decoded.set(source.subarray(index, index + length), outputOffset);
		outputOffset += length;
		index += length;
	}
	return decoded;
}

function decodedPackBitsLength(source: Uint8ClampedArray): number {
	let decodedLength = 0;
	for (let index = 0; index < source.length; ) {
		const control = source[index++]!;
		const length = (control & 0x7f) + 1;
		if ((control & PACK_BITS_RUN_FLAG) !== 0) {
			if (index >= source.length) throw new Error('Incomplete pixel run.');
			index += 1;
		} else {
			if (index + length > source.length)
				throw new Error('Incomplete literal pixel sequence.');
			index += length;
		}
		decodedLength += length;
	}
	return decodedLength;
}

function bytesToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK_SIZE)
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + BYTE_CHUNK_SIZE),
		);
	return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8ClampedArray {
	const binary = atob(encoded);
	const bytes = new Uint8ClampedArray(binary.length);
	for (let index = 0; index < binary.length; index += 1)
		bytes[index] = binary.charCodeAt(index);
	return bytes;
}

function base64Length(byteLength: number): number {
	return (
		Math.ceil(byteLength / BASE64_INPUT_GROUP_SIZE) * BASE64_OUTPUT_GROUP_SIZE
	);
}

function pixelFingerprint(pixels: Uint8ClampedArray): number {
	let hash = FNV_OFFSET_BASIS;
	for (const byte of pixels) {
		hash ^= byte;
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}

function pixelBytesEqual(
	left: Uint8ClampedArray,
	right: Uint8ClampedArray,
): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1)
		if (left[index] !== right[index]) return false;
	return true;
}
