import type { CropRect, Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { CoreLayerId } from '../../core/layers/layerTypes';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId } from '../annotations/annotationTypes';
import {
	createFloodFillMask,
	floodFill,
	type FloodFillOptions,
	type FloodFillRun,
} from './floodFillHelpers';

const HEX_RADIX = 16;
const HEX_CHANNEL_WIDTH = 2;

/** Immediate image actions, independent of toolbar presentation and gesture state. */
export class DrawingImageActions {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly shapes?: AnnotationDocument,
	) {}

	sampleColor(point: Point): string {
		const x = Math.max(
			0,
			Math.min(this.documentModel.width - 1, Math.floor(point.x)),
		);
		const y = Math.max(
			0,
			Math.min(this.documentModel.height - 1, Math.floor(point.y)),
		);
		const pixel = this.documentModel.context.getImageData(x, y, 1, 1).data;
		return `#${[pixel[0], pixel[1], pixel[2]].map((value) => value!.toString(HEX_RADIX).padStart(HEX_CHANNEL_WIDTH, '0')).join('')}`;
	}

	fillAt(point: Point, options: FloodFillOptions): void {
		const x = Math.max(
			0,
			Math.min(this.documentModel.width - 1, Math.floor(point.x)),
		);
		const y = Math.max(
			0,
			Math.min(this.documentModel.height - 1, Math.floor(point.y)),
		);
		if (this.shapes) {
			const composite = this.documentModel.compositeCanvas();
			const runs = createFloodFillMask(
				composite.getContext('2d')!,
				this.documentModel.width,
				this.documentModel.height,
				x,
				y,
				options,
			);
			if (runs.length === 0) return;
			this.shapes.add({
				id: crypto.randomUUID(),
				type: AnnotationObjectTypeId.Fill,
				layerId: CoreLayerId.Objects,
				rect: fillBounds(runs),
				runs: [...runs],
				color: options.color,
				opacity: options.opacity,
				tolerance: options.tolerance,
				rotation: 0,
			});
			return;
		}
		const changed = floodFill(
			this.documentModel.context,
			this.documentModel.width,
			this.documentModel.height,
			x,
			y,
			options,
		);
		if (changed) this.documentModel.commit();
	}
}

function fillBounds(runs: readonly FloodFillRun[]): CropRect {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const run of runs) {
		left = Math.min(left, run.x);
		top = Math.min(top, run.y);
		right = Math.max(right, run.x + run.length);
		bottom = Math.max(bottom, run.y + 1);
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}
