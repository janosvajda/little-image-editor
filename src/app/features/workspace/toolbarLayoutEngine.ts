import { ToolbarDock } from './managedToolbarPanel';

export interface ToolbarPoint {
	readonly x: number;
	readonly y: number;
}

export interface ToolbarSize {
	readonly width: number;
	readonly height: number;
}

export interface ToolbarRectangle extends ToolbarPoint, ToolbarSize {}

export interface ToolbarLayoutBounds extends ToolbarSize {
	readonly bottomInset: number;
}

export interface ToolbarLayoutOptions {
	readonly margin: number;
	readonly gap: number;
}

const FIRST_CANDIDATE_INDEX = 0;

export class ToolbarLayoutEngine {
	constructor(private readonly options: ToolbarLayoutOptions) {}

	clamp(
		point: ToolbarPoint,
		size: ToolbarSize,
		bounds: ToolbarLayoutBounds,
	): ToolbarPoint {
		return {
			x: Math.max(0, Math.min(point.x, bounds.width - size.width)),
			y: Math.max(
				0,
				Math.min(point.y, bounds.height - size.height - bounds.bottomInset),
			),
		};
	}

	findDockPosition(
		size: ToolbarSize,
		dock: ToolbarDock,
		obstacles: readonly ToolbarRectangle[],
		bounds: ToolbarLayoutBounds,
	): ToolbarPoint {
		const direction = dock === ToolbarDock.Left ? 1 : -1;
		let x =
			dock === ToolbarDock.Left
				? this.options.margin
				: bounds.width - size.width - this.options.margin;
		const maximumBottom =
			bounds.height - bounds.bottomInset - this.options.margin;
		const availableColumnHeight = maximumBottom - this.options.margin;
		if (size.height > availableColumnHeight)
			return this.clamp({ x, y: this.options.margin }, size, bounds);
		const maximumColumns = obstacles.length + 1;

		for (let column = 0; column < maximumColumns; column += 1) {
			let y = this.options.margin;
			let nextColumnX = x;
			while (y + size.height <= maximumBottom) {
				const candidate = { x, y, ...size };
				const collision = obstacles.find((obstacle) =>
					this.overlaps(candidate, obstacle),
				);
				if (!collision) return this.clamp(candidate, size, bounds);
				nextColumnX =
					dock === ToolbarDock.Left
						? Math.max(
								nextColumnX,
								collision.x + collision.width + this.options.gap,
							)
						: Math.min(
								nextColumnX,
								collision.x - size.width - this.options.gap,
							);
				y = collision.y + collision.height + this.options.gap;
			}
			x =
				nextColumnX === x
					? x + direction * (size.width + this.options.gap)
					: nextColumnX;
		}

		return this.clamp({ x, y: this.options.margin }, size, bounds);
	}

	resolveNearest(
		requested: ToolbarPoint,
		size: ToolbarSize,
		obstacles: readonly ToolbarRectangle[],
		bounds: ToolbarLayoutBounds,
	): ToolbarPoint {
		const origin = this.clamp(requested, size, bounds);
		const originRectangle = { ...origin, ...size };
		if (!obstacles.some((obstacle) => this.overlaps(originRectangle, obstacle)))
			return origin;

		const candidates = obstacles.flatMap((obstacle) => [
			{ x: obstacle.x - size.width - this.options.gap, y: origin.y },
			{ x: obstacle.x + obstacle.width + this.options.gap, y: origin.y },
			{ x: origin.x, y: obstacle.y - size.height - this.options.gap },
			{ x: origin.x, y: obstacle.y + obstacle.height + this.options.gap },
		]);
		const validCandidates = candidates
			.map((candidate) => this.clamp(candidate, size, bounds))
			.filter((candidate) =>
				obstacles.every((obstacle) =>
					this.doesNotOverlap({ ...candidate, ...size }, obstacle),
				),
			)
			.sort(
				(left, right) =>
					this.distanceSquared(left, origin) -
					this.distanceSquared(right, origin),
			);

		return (
			validCandidates[FIRST_CANDIDATE_INDEX] ??
			this.findDockPosition(size, ToolbarDock.Right, obstacles, bounds)
		);
	}

	overlaps(left: ToolbarRectangle, right: ToolbarRectangle): boolean {
		return (
			left.x < right.x + right.width &&
			left.x + left.width > right.x &&
			left.y < right.y + right.height &&
			left.y + left.height > right.y
		);
	}

	private doesNotOverlap(
		left: ToolbarRectangle,
		right: ToolbarRectangle,
	): boolean {
		return !this.overlaps(left, right);
	}

	private distanceSquared(left: ToolbarPoint, right: ToolbarPoint): number {
		const horizontalDistance = left.x - right.x;
		const verticalDistance = left.y - right.y;
		return horizontalDistance ** 2 + verticalDistance ** 2;
	}
}
