import type { Point } from '../../../core/document/appTypes';
import type { RasterSelection } from '../../selection/rasterSelection';
import type { DrawingGesture } from './drawingGesture';

export class RasterSelectionGesture implements DrawingGesture {
	constructor(
		private readonly selection: RasterSelection,
		start: Point,
	) {
		selection.begin(start);
	}
	update(point: Point): void {
		this.selection.update(point);
	}
	complete(point: Point): void {
		this.selection.finish(point);
	}
	cancel(): void {
		this.selection.clear();
	}
}
