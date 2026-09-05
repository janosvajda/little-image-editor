import type { Point } from '../../core/document/appTypes';
import { decodePixelBytes } from '../../shared/image/pixelDataCodec';
import type { RasterFragmentAnnotation } from './annotationTypes';
import { renderAnnotationObject } from './annotationRenderer';
import { objectLocalPoint } from './objectErasures';

const RasterPixel = { Alpha: 3, DefaultPressure: 1 } as const;

/** Native fragment pixels with its masks applied, shared by painting and hit testing. */
export class RasterFragmentSurface {
	readonly canvas = document.createElement('canvas');
	readonly context: CanvasRenderingContext2D;

	constructor(object: RasterFragmentAnnotation) {
		this.canvas.width = object.pixelWidth;
		this.canvas.height = object.pixelHeight;
		this.context = this.canvas.getContext('2d')!;
		if (
			!object.erasures?.length &&
			!object.pixelCutouts?.length &&
			!object.pixelClips?.length
		) {
			this.context.putImageData(
				new ImageData(
					new Uint8ClampedArray(decodePixelBytes(object.pixels)),
					object.pixelWidth,
					object.pixelHeight,
				),
				0,
				0,
			);
		} else {
			renderAnnotationObject(this.context, this.canvas, {
				...object,
				rect: {
					x: 0,
					y: 0,
					width: object.pixelWidth,
					height: object.pixelHeight,
				},
				rotation: 0,
			});
		}
	}

	contains(object: RasterFragmentAnnotation, point: Point): boolean {
		const local = objectLocalPoint(object, point, RasterPixel.DefaultPressure);
		if (
			local.xRatio < 0 ||
			local.xRatio >= 1 ||
			local.yRatio < 0 ||
			local.yRatio >= 1
		)
			return false;
		const pixel = this.context.getImageData(
			Math.floor(local.xRatio * this.canvas.width),
			Math.floor(local.yRatio * this.canvas.height),
			1,
			1,
		);
		return pixel.data[RasterPixel.Alpha]! > 0;
	}
}
