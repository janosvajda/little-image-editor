import { quantize } from './colorQuantizer';

/**
 * An animated GIF (GIF89a) of whole frames. Each frame has its own palette
 * of up to 256 colours, chosen by `quantize`, with one index kept for
 * transparent pixels where it has any; frames are LZW-compressed as GIF
 * requires. Each frame replaces the one before, so transparent areas show
 * what is behind the GIF, never the previous frame.
 */

export interface GifFrame {
	/** The frame's pixels, RGBA, `width × height` of the GIF. */
	readonly pixels: Uint8ClampedArray;
	/** How long the frame shows, in hundredths of a second, as GIF counts time. */
	readonly delay: number;
}

export interface GifOptions {
	readonly width: number;
	readonly height: number;
	/** Whether the GIF plays again from its first frame after its last, forever. */
	readonly loop: boolean;
}

const SIGNATURE = 'GIF89a';
const MAX_COLORS = 256;
/** GIF image data: codes grow from the minimum code size plus one, to 12 bits at most. */
const MAX_CODE_BITS = 12;
const MAX_CODES = 1 << MAX_CODE_BITS;
const MIN_CODE_SIZE = 2;
const SUB_BLOCK_MAX = 255;
const BITS_PER_BYTE = 8;
const BYTE_MASK = 0xff;
const RGB_CHANNELS = 3;
const GifByte = {
	ExtensionIntroducer: 0x21,
	GraphicControlLabel: 0xf9,
	ApplicationLabel: 0xff,
	ImageSeparator: 0x2c,
	BlockTerminator: 0x00,
	Trailer: 0x3b,
} as const;
/** The logical screen's packed fields: no global colour table, 8 bits of colour resolution. */
const SCREEN_PACKED = 0x70;
/** A local colour table follows the image descriptor; its size is in the low three bits. */
const LOCAL_TABLE_FLAG = 0x80;
/** Disposal method 2: the frame's area is cleared before the next frame is drawn. */
const DISPOSE_TO_BACKGROUND = 2 << 2;
const TRANSPARENT_FLAG = 0x01;
const GRAPHIC_CONTROL_SIZE = 4;
const NETSCAPE_IDENTIFIER = 'NETSCAPE2.0';
/** The Netscape extension's one sub-block: three bytes long, the first naming the loop count, which follows. */
const NetscapeLoop = { BlockSize: 0x03, LoopCountId: 0x01 } as const;
const LOOP_FOREVER = 0;

/** The GIF's bytes. */
export function encodeGif(frames: readonly GifFrame[], { width, height, loop }: GifOptions): Uint8Array<ArrayBuffer> {
	const bytes = new ByteWriter();
	bytes.text(SIGNATURE);
	bytes.word(width);
	bytes.word(height);
	bytes.byte(SCREEN_PACKED);
	bytes.byte(0);
	bytes.byte(0);
	if (loop) {
		bytes.bytes([GifByte.ExtensionIntroducer, GifByte.ApplicationLabel, NETSCAPE_IDENTIFIER.length]);
		bytes.text(NETSCAPE_IDENTIFIER);
		bytes.bytes([NetscapeLoop.BlockSize, NetscapeLoop.LoopCountId]);
		bytes.word(LOOP_FOREVER);
		bytes.byte(GifByte.BlockTerminator);
	}
	for (const frame of frames) writeFrame(bytes, frame, width, height);
	bytes.byte(GifByte.Trailer);
	return bytes.result();
}

function writeFrame(bytes: ByteWriter, frame: GifFrame, width: number, height: number): void {
	const { palette, indices, transparentIndex } = quantize(frame.pixels, MAX_COLORS);
	const tableBits = Math.max(1, Math.ceil(Math.log2(palette.length / RGB_CHANNELS)));
	bytes.bytes([GifByte.ExtensionIntroducer, GifByte.GraphicControlLabel, GRAPHIC_CONTROL_SIZE]);
	bytes.byte(DISPOSE_TO_BACKGROUND | (transparentIndex === null ? 0 : TRANSPARENT_FLAG));
	bytes.word(Math.max(0, Math.round(frame.delay)));
	bytes.byte(transparentIndex ?? 0);
	bytes.byte(GifByte.BlockTerminator);
	bytes.byte(GifByte.ImageSeparator);
	bytes.word(0);
	bytes.word(0);
	bytes.word(width);
	bytes.word(height);
	bytes.byte(LOCAL_TABLE_FLAG | (tableBits - 1));
	const table = new Uint8Array((1 << tableBits) * RGB_CHANNELS);
	table.set(palette);
	bytes.bytes(table);
	const minCodeSize = Math.max(MIN_CODE_SIZE, tableBits);
	bytes.byte(minCodeSize);
	const data = compress(indices, minCodeSize);
	for (let offset = 0; offset < data.length; offset += SUB_BLOCK_MAX) {
		const block = data.subarray(offset, offset + SUB_BLOCK_MAX);
		bytes.byte(block.length);
		bytes.bytes(block);
	}
	bytes.byte(GifByte.BlockTerminator);
}

/** GIF's LZW: variable-length codes, least significant bit first, the table cleared when it is full. */
export function compress(indices: Uint8Array, minCodeSize: number): Uint8Array<ArrayBuffer> {
	const output = new BitWriter();
	const clear = 1 << minCodeSize;
	const end = clear + 1;
	let table = new Map<number, number>();
	let nextCode = end + 1;
	let codeSize = minCodeSize + 1;
	output.write(clear, codeSize);
	let prefix = indices[0];
	if (prefix === undefined) {
		output.write(end, codeSize);
		return output.result();
	}
	for (let index = 1; index < indices.length; index++) {
		const symbol = indices[index]!;
		const key = (prefix << BITS_PER_BYTE) | symbol;
		const known = table.get(key);
		if (known !== undefined) {
			prefix = known;
			continue;
		}
		output.write(prefix, codeSize);
		if (nextCode < MAX_CODES) {
			table.set(key, nextCode);
			if (nextCode === 1 << codeSize && codeSize < MAX_CODE_BITS) codeSize++;
			nextCode++;
		} else {
			output.write(clear, codeSize);
			table = new Map();
			nextCode = end + 1;
			codeSize = minCodeSize + 1;
		}
		prefix = symbol;
	}
	output.write(prefix, codeSize);
	output.write(end, codeSize);
	return output.result();
}

/** Bytes appended to a growing buffer. */
class ByteWriter {
	#buffer: Uint8Array<ArrayBuffer> = new Uint8Array(BYTE_MASK + 1);
	#length = 0;

	byte(value: number): void {
		this.ensure(1);
		this.#buffer[this.#length++] = value & BYTE_MASK;
	}

	/** A 16-bit number, low byte first, as GIF writes them. */
	word(value: number): void {
		this.byte(value);
		this.byte(value >> BITS_PER_BYTE);
	}

	bytes(values: ArrayLike<number>): void {
		this.ensure(values.length);
		this.#buffer.set(values, this.#length);
		this.#length += values.length;
	}

	text(value: string): void {
		this.bytes([...value].map((character) => character.charCodeAt(0)));
	}

	result(): Uint8Array<ArrayBuffer> {
		return this.#buffer.slice(0, this.#length);
	}

	private ensure(extra: number): void {
		if (this.#length + extra <= this.#buffer.length) return;
		const grown = new Uint8Array(Math.max(this.#buffer.length * 2, this.#length + extra));
		grown.set(this.#buffer.subarray(0, this.#length));
		this.#buffer = grown;
	}
}

/** Codes of any width packed into bytes, least significant bit first. */
class BitWriter {
	readonly #bytes = new ByteWriter();
	#current = 0;
	#bits = 0;

	write(code: number, size: number): void {
		this.#current |= code << this.#bits;
		this.#bits += size;
		while (this.#bits >= BITS_PER_BYTE) {
			this.#bytes.byte(this.#current & BYTE_MASK);
			this.#current >>>= BITS_PER_BYTE;
			this.#bits -= BITS_PER_BYTE;
		}
	}

	result(): Uint8Array<ArrayBuffer> {
		if (this.#bits > 0) this.#bytes.byte(this.#current & BYTE_MASK);
		return this.#bytes.result();
	}
}
