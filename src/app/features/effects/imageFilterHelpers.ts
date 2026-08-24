export const EffectId = {
	Monochrome: 'monochrome',
	Sepia: 'sepia',
	Invert: 'invert',
	Sharpen: 'sharpen',
} as const;
export type ColorEffect = Exclude<
	(typeof EffectId)[keyof typeof EffectId],
	typeof EffectId.Sharpen
>;
const BYTE_MAX = 255;
const FilterMath = {
	PercentScale: 100,
	ContrastScale: 259,
	ChannelMidpoint: 128,
	PixelStride: 4,
	SharpenNeighbourCount: 4,
} as const;
const Channel = { Red: 0, Green: 1, Blue: 2 } as const;
const PERCENT_TO_BYTE = BYTE_MAX / FilterMath.PercentScale;
const LUMA = { red: 0.299, green: 0.587, blue: 0.114 } as const;
const SEPIA = {
	red: { red: 0.393, green: 0.769, blue: 0.189 },
	green: { red: 0.349, green: 0.686, blue: 0.168 },
	blue: { red: 0.272, green: 0.534, blue: 0.131 },
} as const;

export interface ToneAdjustments {
	brightness: number;
	contrast: number;
	saturation: number;
}

export function applyToneAdjustments(
	image: ImageData,
	adjustments: ToneAdjustments,
): ImageData {
	const result = new ImageData(
		new Uint8ClampedArray(image.data),
		image.width,
		image.height,
	);
	const brightness = adjustments.brightness * PERCENT_TO_BYTE;
	const contrastFactor = FilterMath.ContrastScale;
	const contrast =
		(contrastFactor * (adjustments.contrast + BYTE_MAX)) /
		(BYTE_MAX * (contrastFactor - adjustments.contrast));
	const saturation = 1 + adjustments.saturation / FilterMath.PercentScale;
	for (
		let index = 0;
		index < result.data.length;
		index += FilterMath.PixelStride
	) {
		let red = result.data[index]! + brightness;
		let green = result.data[index + Channel.Green]! + brightness;
		let blue = result.data[index + Channel.Blue]! + brightness;
		red =
			contrast * (red - FilterMath.ChannelMidpoint) +
			FilterMath.ChannelMidpoint;
		green =
			contrast * (green - FilterMath.ChannelMidpoint) +
			FilterMath.ChannelMidpoint;
		blue =
			contrast * (blue - FilterMath.ChannelMidpoint) +
			FilterMath.ChannelMidpoint;
		const gray = LUMA.red * red + LUMA.green * green + LUMA.blue * blue;
		result.data[index] = gray + saturation * (red - gray);
		result.data[index + Channel.Green] = gray + saturation * (green - gray);
		result.data[index + Channel.Blue] = gray + saturation * (blue - gray);
	}
	return result;
}

export function applyColorEffect(
	image: ImageData,
	effect: ColorEffect,
	amount = 1,
): void {
	const { data } = image;
	const mix = Math.max(0, Math.min(1, amount));
	for (let index = 0; index < data.length; index += FilterMath.PixelStride) {
		const red = data[index]!,
			green = data[index + Channel.Green]!,
			blue = data[index + Channel.Blue]!;
		let outputRed = red,
			outputGreen = green,
			outputBlue = blue;
		if (effect === EffectId.Monochrome)
			outputRed =
				outputGreen =
				outputBlue =
					LUMA.red * red + LUMA.green * green + LUMA.blue * blue;
		if (effect === EffectId.Invert) {
			outputRed = BYTE_MAX - red;
			outputGreen = BYTE_MAX - green;
			outputBlue = BYTE_MAX - blue;
		}
		if (effect === EffectId.Sepia) {
			outputRed =
				SEPIA.red.red * red + SEPIA.red.green * green + SEPIA.red.blue * blue;
			outputGreen =
				SEPIA.green.red * red +
				SEPIA.green.green * green +
				SEPIA.green.blue * blue;
			outputBlue =
				SEPIA.blue.red * red +
				SEPIA.blue.green * green +
				SEPIA.blue.blue * blue;
		}
		data[index] = red + (outputRed - red) * mix;
		data[index + Channel.Green] = green + (outputGreen - green) * mix;
		data[index + Channel.Blue] = blue + (outputBlue - blue) * mix;
	}
}

export function applySharpen(image: ImageData, strength = 1): void {
	const { data, width, height } = image;
	const source = new Uint8ClampedArray(data);
	const amount = Math.max(0, strength);
	for (let y = 1; y < height - 1; y++)
		for (let x = 1; x < width - 1; x++)
			for (let channel = 0; channel < FilterMath.PixelStride - 1; channel++) {
				const index = (y * width + x) * FilterMath.PixelStride + channel;
				data[index] =
					(1 + FilterMath.SharpenNeighbourCount * amount) * source[index]! -
					amount *
						(source[index - FilterMath.PixelStride]! +
							source[index + FilterMath.PixelStride]! +
							source[index - width * FilterMath.PixelStride]! +
							source[index + width * FilterMath.PixelStride]!);
			}
}
