export interface FloodFillOptions {
	readonly color: string;
	readonly opacity: number;
	readonly tolerance: number;
}

export interface FloodFillRun {
	readonly x: number;
	readonly y: number;
	readonly length: number;
}

const COLOR_CHANNEL_COUNT = 4;
const COLOR_CHANNEL_MAXIMUM = 255;
const ALPHA_CHANNEL_OFFSET = 3;
const RED_CHANNEL_OFFSET = 0;
const GREEN_CHANNEL_OFFSET = 1;
const BLUE_CHANNEL_OFFSET = 2;
const HEX_RADIX = 16;

export function floodFill(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	startX: number,
	startY: number,
	options: FloodFillOptions,
): boolean {
	if (!validFillRequest(width, height, startX, startY)) return false;
	return new FloodFillOperation(
		context,
		width,
		height,
		startX,
		startY,
		options,
	).run();
}

export function createFloodFillMask(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	startX: number,
	startY: number,
	options: FloodFillOptions,
): readonly FloodFillRun[] {
	if (!validFillRequest(width, height, startX, startY)) return [];
	return new FloodFillOperation(
		context,
		width,
		height,
		startX,
		startY,
		options,
	).createMask();
}

class FloodFillOperation {
	readonly #image: ImageData;
	readonly #pixels: Uint8ClampedArray;
	readonly #target: readonly number[];
	readonly #source: readonly [number, number, number];
	readonly #opacity: number;
	readonly #tolerance: number;
	readonly #visited: Uint8Array;
	readonly #stack: number[];
	#changed = false;

	constructor(
		private readonly context: CanvasRenderingContext2D,
		private readonly width: number,
		private readonly height: number,
		startX: number,
		startY: number,
		options: FloodFillOptions,
	) {
		this.#image = context.getImageData(0, 0, width, height);
		this.#pixels = this.#image.data;
		this.#target = this.colorAt(startX, startY);
		this.#source = parseHexColor(options.color);
		this.#opacity = clamp(options.opacity, 0, 1);
		this.#tolerance = clamp(
			Math.round(options.tolerance),
			0,
			COLOR_CHANNEL_MAXIMUM,
		);
		this.#visited = new Uint8Array(width * height);
		this.#stack = [startX, startY];
	}

	run(): boolean {
		this.scan();
		if (this.#changed) this.context.putImageData(this.#image, 0, 0);
		return this.#changed;
	}

	createMask(): readonly FloodFillRun[] {
		this.scan();
		return this.#changed ? maskRuns(this.#visited, this.width, this.height) : [];
	}

	private scan(): void {
		if (
			composite(this.#source, this.#opacity, this.#target).every(
				(value, index) => value === this.#target[index],
			)
		)
			return;
		while (this.#stack.length)
			this.fillSegment(this.#stack.pop()!, this.#stack.pop()!);
	}

	private fillSegment(y: number, x: number): void {
		let scanY = this.segmentStart(x, y);
		let reachesLeft = false;
		let reachesRight = false;
		for (; scanY < this.height && this.matches(x, scanY); scanY += 1) {
			this.replace(x, scanY);
			reachesLeft = this.queueNeighbour(x - 1, scanY, x > 0, reachesLeft);
			reachesRight = this.queueNeighbour(
				x + 1,
				scanY,
				x < this.width - 1,
				reachesRight,
			);
		}
	}

	private segmentStart(x: number, y: number): number {
		let scanY = y;
		while (scanY >= 0 && this.matches(x, scanY)) scanY -= 1;
		return scanY + 1;
	}

	private queueNeighbour(
		x: number,
		y: number,
		inBounds: boolean,
		alreadyQueued: boolean,
	): boolean {
		if (!inBounds || !this.matches(x, y)) return false;
		if (!alreadyQueued) this.#stack.push(x, y);
		return true;
	}

	private replace(x: number, y: number): void {
		const pixel = y * this.width + x;
		const index = pixel * COLOR_CHANNEL_COUNT;
		this.#visited[pixel] = 1;
		this.#pixels.set(
			composite(this.#source, this.#opacity, this.colorAt(x, y)),
			index,
		);
		this.#changed = true;
	}

	private matches(x: number, y: number): boolean {
		const pixel = y * this.width + x;
		if (this.#visited[pixel]) return false;
		const candidate = this.colorAt(x, y);
		if (
			this.#target[ALPHA_CHANNEL_OFFSET] === 0 &&
			candidate[ALPHA_CHANNEL_OFFSET] === 0
		)
			return true;
		return (
			Math.max(
				...candidate.map((value, channel) =>
					Math.abs(value - this.#target[channel]!),
				),
			) <= this.#tolerance
		);
	}

	private colorAt(x: number, y: number): readonly number[] {
		const index = (y * this.width + x) * COLOR_CHANNEL_COUNT;
		return Array.from(
			this.#pixels.subarray(index, index + COLOR_CHANNEL_COUNT),
		);
	}
}

function validFillRequest(
	width: number,
	height: number,
	startX: number,
	startY: number,
): boolean {
	return (
		width > 0 &&
		height > 0 &&
		startX >= 0 &&
		startY >= 0 &&
		startX < width &&
		startY < height
	);
}

function maskRuns(
	visited: Uint8Array,
	width: number,
	height: number,
): FloodFillRun[] {
	const runs: FloodFillRun[] = [];
	for (let y = 0; y < height; y += 1) {
		let x = 0;
		while (x < width) {
			while (x < width && visited[y * width + x] === 0) x += 1;
			const start = x;
			while (x < width && visited[y * width + x] !== 0) x += 1;
			if (x > start) runs.push({ x: start, y, length: x - start });
		}
	}
	return runs;
}

function parseHexColor(color: string): readonly [number, number, number] {
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
	return match
		? [
				Number.parseInt(match[1]!, HEX_RADIX),
				Number.parseInt(match[2]!, HEX_RADIX),
				Number.parseInt(match[3]!, HEX_RADIX),
			]
		: [0, 0, 0];
}

function composite(
	source: readonly [number, number, number],
	opacity: number,
	destination: readonly number[],
): Uint8ClampedArray {
	const destinationAlpha =
		destination[ALPHA_CHANNEL_OFFSET]! / COLOR_CHANNEL_MAXIMUM;
	const outputAlpha = opacity + destinationAlpha * (1 - opacity);
	if (outputAlpha <= 0) return new Uint8ClampedArray([0, 0, 0, 0]);
	return new Uint8ClampedArray([
		(source[RED_CHANNEL_OFFSET] * opacity +
			destination[RED_CHANNEL_OFFSET]! * destinationAlpha * (1 - opacity)) /
			outputAlpha,
		(source[GREEN_CHANNEL_OFFSET] * opacity +
			destination[GREEN_CHANNEL_OFFSET]! * destinationAlpha * (1 - opacity)) /
			outputAlpha,
		(source[BLUE_CHANNEL_OFFSET] * opacity +
			destination[BLUE_CHANNEL_OFFSET]! * destinationAlpha * (1 - opacity)) /
			outputAlpha,
		outputAlpha * COLOR_CHANNEL_MAXIMUM,
	]);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}
