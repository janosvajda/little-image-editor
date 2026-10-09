import type { AnnotationRenderState } from './annotationDocument';
import { annotationBounds } from './annotationDocument';
import { PaintToolId } from '../../core/document/appTypes';
import { ShapeHandleMetrics } from '../../core/geometry/shapeTransformHelpers';
import { withShapeTransform } from '../../core/geometry/shapeTransformHelpers';
import {
	renderAnnotationObject,
	renderAnnotationObjects,
	renderAnnotationSelection,
	renderObjectErasureTail,
	renderStrokeTail,
	supportsIncrementalStrokeRendering,
} from './annotationRenderer';
import type { AnnotationObject, AnnotationState } from './annotationTypes';
import { AnnotationObjectTypeId } from './annotationTypes';
import { compositeLayer } from '../layers/layerCompositing';

const INITIAL_REVISION = -1;
const REQUIRED_CACHE_CONTEXT_METHODS = [
	'clearRect',
	'drawImage',
	'fillText',
	'strokeRect',
] as const satisfies readonly (keyof CanvasRenderingContext2D)[];
const AnnotationCacheGeometry = {
	SelectionPadding:
		ShapeHandleMetrics.Offset + ShapeHandleMetrics.HitTolerance,
	StrokePaddingFactor: 2,
	BlurPaddingFactor: 2,
} as const;

export interface AnnotationRenderMetrics {
	readonly cacheBuilds: number;
	readonly cachedObjectsRendered: number;
	readonly fullComposites: number;
	readonly dirtyComposites: number;
}

interface RenderRegion {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export class AnnotationRenderCache {
	readonly #canvas = document.createElement('canvas');
	readonly #context = this.#canvas.getContext('2d')!;
	readonly #interactiveCanvas = document.createElement('canvas');
	readonly #interactiveContext = this.#interactiveCanvas.getContext('2d')!;
	#interactiveStrokeKey: string | null = null;
	#interactiveStrokePointCount = 0;
	#interactiveErasurePathCount = 0;
	#interactiveErasurePointCount = 0;
	#interactiveErasureRevision = 0;
	#transformedInteractiveStrokeId: string | null = null;
	#cachedRevision = INITIAL_REVISION;
	#cachedStaticRevision = INITIAL_REVISION;
	#excludedObjectId: string | null = null;
	#excludedObjectCanPromote = false;
	#cacheBuilds = 0;
	#cachedObjectsRendered = 0;
	#fullComposites = 0;
	#dirtyComposites = 0;
	#previousInteractiveBounds: RenderRegion | null = null;
	#previousInteractiveId: string | null = null;
	#previousSelectedId: string | null = null;
	#imageBackdrop: HTMLCanvasElement | null = null;
	readonly #cachedObjectIds = new Set<string>();
	readonly #cacheSupported = REQUIRED_CACHE_CONTEXT_METHODS.every(
		(method) => typeof this.#context[method] === 'function',
	);

	get metrics(): AnnotationRenderMetrics {
		return {
			cacheBuilds: this.#cacheBuilds,
			cachedObjectsRendered: this.#cachedObjectsRendered,
			fullComposites: this.#fullComposites,
			dirtyComposites: this.#dirtyComposites,
		};
	}

	invalidate(): void {
		this.#cachedRevision = INITIAL_REVISION;
		this.#cachedStaticRevision = INITIAL_REVISION;
		this.#interactiveStrokeKey = null;
		this.#interactiveStrokePointCount = 0;
		this.resetInteractiveErasure();
		this.#transformedInteractiveStrokeId = null;
		this.#cachedObjectIds.clear();
		this.#excludedObjectCanPromote = false;
		this.resetInteractiveFrame();
	}

	render(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		state: Readonly<AnnotationState>,
		renderState: AnnotationRenderState,
		selected: AnnotationObject | null,
		interactive: AnnotationObject | null,
		imageBackdrop: HTMLCanvasElement | null = null,
	): void {
		if (!this.#cacheSupported) {
			this.renderWithoutCache(
				target,
				baseCanvas,
				state,
				selected,
				imageBackdrop,
			);
			return;
		}
		this.resize(target.canvas.width, target.canvas.height);
		if (imageBackdrop !== this.#imageBackdrop) {
			this.#imageBackdrop = imageBackdrop;
			this.invalidate();
		}
		const excludedId = interactive?.id ?? null;
		const promoted = this.promoteCommittedInteractive(
			baseCanvas,
			state,
			renderState,
			excludedId,
		);
		const cacheReused =
			promoted || this.canReuse(renderState, excludedId);
		if (!cacheReused)
			this.rebuild(
				baseCanvas,
				state,
				renderState.revision,
				renderState.staticRevision,
				excludedId,
			);
		else this.#cachedRevision = renderState.revision;

		const currentBounds = interactive
			? visualBounds(interactive, target.canvas.width, target.canvas.height)
			: null;
		const dirtyRegion = this.dirtyRegion(
			cacheReused,
			interactive,
			selected,
			currentBounds,
			target.canvas.width,
			target.canvas.height,
		);
		if (dirtyRegion)
			this.composeRegion(target, baseCanvas, interactive!, selected, dirtyRegion);
		else this.composeFull(target, baseCanvas, interactive, selected);

		this.#previousInteractiveBounds = currentBounds;
		this.#previousInteractiveId = excludedId;
		this.#previousSelectedId = selected?.id ?? null;
	}

	private renderWithoutCache(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		state: Readonly<AnnotationState>,
		selected: AnnotationObject | null,
		imageBackdrop: HTMLCanvasElement | null,
	): void {
		target.clearRect(0, 0, target.canvas.width, target.canvas.height);
		if (imageBackdrop) target.drawImage(imageBackdrop, 0, 0);
		renderAnnotationObjects(target, baseCanvas, state.objects);
		if (selected) renderAnnotationSelection(target, selected);
		this.#fullComposites += 1;
	}

	private dirtyRegion(
		cacheReused: boolean,
		interactive: AnnotationObject | null,
		selected: AnnotationObject | null,
		currentBounds: RenderRegion | null,
		canvasWidth: number,
		canvasHeight: number,
	): RenderRegion | null {
		if (
			!cacheReused ||
			!interactive ||
			!currentBounds ||
			!this.#previousInteractiveBounds ||
			interactive.rotation ||
			interactive.id !== this.#previousInteractiveId ||
			(selected?.id ?? null) !== this.#previousSelectedId
		)
			return null;
		const region = clampRegion(
			unionRegion(this.#previousInteractiveBounds, currentBounds),
			canvasWidth,
			canvasHeight,
		);
		return hasArea(region) ? region : null;
	}

	private composeFull(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		interactive: AnnotationObject | null,
		selected: AnnotationObject | null,
	): void {
		target.clearRect(0, 0, target.canvas.width, target.canvas.height);
		target.drawImage(this.#canvas, 0, 0);
		if (interactive)
			this.compositeInteractiveObject(target, baseCanvas, interactive);
		if (selected) renderAnnotationSelection(target, selected);
		this.#fullComposites += 1;
	}

	private composeRegion(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		interactive: AnnotationObject,
		selected: AnnotationObject | null,
		region: RenderRegion,
	): void {
		target.clearRect(region.x, region.y, region.width, region.height);
		target.drawImage(
			this.#canvas,
			region.x,
			region.y,
			region.width,
			region.height,
			region.x,
			region.y,
			region.width,
			region.height,
		);
		target.save();
		target.beginPath();
		target.rect(region.x, region.y, region.width, region.height);
		target.clip();
		this.compositeInteractiveObject(target, baseCanvas, interactive);
		if (selected) renderAnnotationSelection(target, selected);
		target.restore();
		this.#dirtyComposites += 1;
	}

	private canReuse(
		renderState: AnnotationRenderState,
		excludedId: string | null,
	): boolean {
		if (excludedId !== this.#excludedObjectId) {
			if (
				excludedId !== null &&
				this.#excludedObjectId === null &&
				!this.#cachedObjectIds.has(excludedId) &&
				renderState.interactionActive &&
				renderState.changedObjectId === excludedId &&
				renderState.staticRevision === this.#cachedStaticRevision
			) {
				this.#excludedObjectId = excludedId;
				this.#excludedObjectCanPromote = true;
				this.#cachedRevision = renderState.revision;
				return true;
			}
			return false;
		}
		if (Number.isFinite(renderState.staticRevision))
			return renderState.staticRevision === this.#cachedStaticRevision;
		if (renderState.revision === this.#cachedRevision) return true;
		return (
			excludedId !== null &&
			renderState.changedObjectId === excludedId &&
			renderState.revision === this.#cachedRevision + 1
		);
	}

	private promoteCommittedInteractive(
		baseCanvas: HTMLCanvasElement,
		state: Readonly<AnnotationState>,
		renderState: AnnotationRenderState,
		excludedId: string | null,
	): boolean {
		if (
			excludedId !== null ||
			this.#excludedObjectId === null ||
			!this.#excludedObjectCanPromote ||
			renderState.interactionActive ||
			renderState.changedObjectId !== this.#excludedObjectId ||
			renderState.staticRevision !== this.#cachedStaticRevision + 1
		)
			return false;
		const committed = state.objects.find(
			(object) => object.id === this.#excludedObjectId,
		);
		if (!committed) return false;
		if (
			committed.type === AnnotationObjectTypeId.Stroke &&
			isTransformedStroke(committed)
		)
			return false;
		this.compositeInteractiveObject(this.#context, baseCanvas, committed);
		this.#cachedRevision = renderState.revision;
		this.#cachedStaticRevision = renderState.staticRevision;
		this.#excludedObjectId = null;
		this.#excludedObjectCanPromote = false;
		this.#cachedObjectIds.add(committed.id);
		return true;
	}

	private rebuild(
		baseCanvas: HTMLCanvasElement,
		state: Readonly<AnnotationState>,
		revision: number,
		staticRevision: number,
		excludedId: string | null,
	): void {
		this.#context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
		if (this.#imageBackdrop) this.#context.drawImage(this.#imageBackdrop, 0, 0);
		const objects = excludedId
			? state.objects.filter((object) => object.id !== excludedId)
			: state.objects;
		for (const object of objects) this.renderCachedObject(baseCanvas, object);
		this.#cachedObjectIds.clear();
		for (const object of objects) this.#cachedObjectIds.add(object.id);
		this.#cachedRevision = revision;
		this.#cachedStaticRevision = staticRevision;
		this.#excludedObjectId = excludedId;
		this.#excludedObjectCanPromote =
			excludedId !== null && state.objects.at(-1)?.id === excludedId;
		this.#cacheBuilds += 1;
		this.#cachedObjectsRendered += objects.length;
	}

	private renderCachedObject(
		baseCanvas: HTMLCanvasElement,
		object: AnnotationObject,
	): void {
		if (object.visible === false) return;
		if (isTransformedStroke(object)) {
			this.compositeInteractiveObject(this.#context, baseCanvas, object);
			return;
		}
		compositeLayer(this.#context, object, (layerContext) =>
			renderAnnotationObject(layerContext, baseCanvas, object),
		);
	}

	private compositeInteractiveObject(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		object: AnnotationObject,
	): void {
		compositeLayer(target, object, (layerContext) =>
			this.renderInteractiveObject(layerContext, baseCanvas, object),
		);
	}

	private resetInteractiveFrame(): void {
		this.#previousInteractiveBounds = null;
		this.#previousInteractiveId = null;
		this.#previousSelectedId = null;
	}

	private resize(width: number, height: number): void {
		if (this.#canvas.width === width && this.#canvas.height === height) return;
		this.#canvas.width = width;
		this.#canvas.height = height;
		this.#interactiveCanvas.width = width;
		this.#interactiveCanvas.height = height;
		this.invalidate();
	}

	private renderInteractiveObject(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		object: AnnotationObject,
	): void {
		if (
			object.type === AnnotationObjectTypeId.Stroke &&
			object.tool !== PaintToolId.Eraser &&
			isTransformedStroke(object)
		) {
			this.cacheStrokeSource(baseCanvas, object);
			this.drawTransformedStroke(target, object);
			this.#transformedInteractiveStrokeId = object.id;
			return;
		}
		if (
			object.type !== AnnotationObjectTypeId.Stroke ||
			object.tool === PaintToolId.Eraser
		) {
			renderAnnotationObject(target, baseCanvas, object);
			return;
		}
		if (this.#transformedInteractiveStrokeId === object.id) {
			this.resetInteractiveStroke();
			this.#transformedInteractiveStrokeId = null;
		}
		this.cacheStrokeSource(baseCanvas, object);
		target.drawImage(this.#interactiveCanvas, 0, 0);
	}

	private drawTransformedStroke(
		target: CanvasRenderingContext2D,
		object: Extract<
			AnnotationObject,
			{ type: typeof AnnotationObjectTypeId.Stroke }
		>,
	): void {
		const source = object.sourceRect ?? object.rect;
		if (
			!object.rotation &&
			object.rect.width === source.width &&
			object.rect.height === source.height
		) {
			target.drawImage(
				this.#interactiveCanvas,
				object.rect.x - source.x,
				object.rect.y - source.y,
			);
			return;
		}
		withShapeTransform(target, object, () =>
			target.drawImage(
				this.#interactiveCanvas,
				source.x,
				source.y,
				source.width,
				source.height,
				object.rect.x,
				object.rect.y,
				object.rect.width,
				object.rect.height,
			),
		);
	}

	private cacheStrokeSource(
		baseCanvas: HTMLCanvasElement,
		object: Extract<
			AnnotationObject,
			{ type: typeof AnnotationObjectTypeId.Stroke }
		>,
	): void {
		const source = object.sourceRect ?? object.rect;
		const key = [
			object.id,
			object.seed,
			object.tool,
			object.color,
			object.size,
			object.opacity,
			object.hardness,
		].join(':');
		if (
			key === this.#interactiveStrokeKey &&
			object.points.length === this.#interactiveStrokePointCount &&
			this.renderIncrementalErasure(object)
		)
			return;
		if (
			key === this.#interactiveStrokeKey &&
			object.points.length === this.#interactiveStrokePointCount &&
			(object.erasureRevision ?? 0) === this.#interactiveErasureRevision
		)
			return;
		if (
			key === this.#interactiveStrokeKey &&
			object.points.length > this.#interactiveStrokePointCount &&
			supportsIncrementalStrokeRendering(object)
		) {
			renderStrokeTail(
				this.#interactiveContext,
				object,
				this.#interactiveStrokePointCount,
			);
			this.#interactiveStrokePointCount = object.points.length;
			return;
		}
		this.#interactiveContext.clearRect(
			0,
			0,
			this.#interactiveCanvas.width,
			this.#interactiveCanvas.height,
		);
		renderAnnotationObject(this.#interactiveContext, baseCanvas, {
			...object,
			rect: { ...source },
			rotation: 0,
		});
		this.#interactiveStrokeKey = key;
		this.#interactiveStrokePointCount = object.points.length;
		this.captureInteractiveErasureState(object);
	}

	private renderIncrementalErasure(
		object: Extract<
			AnnotationObject,
			{ type: typeof AnnotationObjectTypeId.Stroke }
		>,
	): boolean {
		const revision = object.erasureRevision ?? 0;
		if (revision === this.#interactiveErasureRevision) return false;
		if (revision !== this.#interactiveErasureRevision + 1) return false;
		const paths = object.erasures ?? [];
		const pathCount = paths.length;
		const extendsCurrentPath = pathCount === this.#interactiveErasurePathCount;
		const startsNewPath = pathCount === this.#interactiveErasurePathCount + 1;
		if (!extendsCurrentPath && !startsNewPath) return false;
		const path = paths.at(-1);
		if (!path) return false;
		const previousPointCount = startsNewPath
			? 1
			: this.#interactiveErasurePointCount;
		if (path.points.length < previousPointCount) return false;
		renderObjectErasureTail(
			this.#interactiveContext,
			{ ...object, rect: { ...(object.sourceRect ?? object.rect) }, rotation: 0 },
			path,
			previousPointCount,
		);
		this.captureInteractiveErasureState(object);
		return true;
	}

	private captureInteractiveErasureState(
		object: Extract<
			AnnotationObject,
			{ type: typeof AnnotationObjectTypeId.Stroke }
		>,
	): void {
		const paths = object.erasures ?? [];
		this.#interactiveErasurePathCount = paths.length;
		this.#interactiveErasurePointCount = paths.at(-1)?.points.length ?? 0;
		this.#interactiveErasureRevision = object.erasureRevision ?? 0;
	}

	private resetInteractiveErasure(): void {
		this.#interactiveErasurePathCount = 0;
		this.#interactiveErasurePointCount = 0;
		this.#interactiveErasureRevision = 0;
	}

	private resetInteractiveStroke(): void {
		this.#interactiveStrokeKey = null;
		this.#interactiveStrokePointCount = 0;
		this.resetInteractiveErasure();
	}
}

function isTransformedStroke(
	object: AnnotationObject,
): object is Extract<
	AnnotationObject,
	{ type: typeof AnnotationObjectTypeId.Stroke }
> & { sourceRect: RenderRegion } {
	if (
		object.type !== AnnotationObjectTypeId.Stroke ||
		object.sourceRect === undefined
	)
		return false;
	const source = object.sourceRect;
	return (
		Boolean(object.rotation) ||
		object.rect.x !== source.x ||
		object.rect.y !== source.y ||
		object.rect.width !== source.width ||
		object.rect.height !== source.height
	);
}

function visualBounds(
	object: AnnotationObject,
	canvasWidth: number,
	canvasHeight: number,
): RenderRegion {
	const bounds = annotationBounds(object);
	const strokePadding =
		'width' in object
			? object.width * AnnotationCacheGeometry.StrokePaddingFactor
			: 0;
	const blurPadding =
		'blur' in object
			? object.blur * AnnotationCacheGeometry.BlurPaddingFactor
			: 0;
	const padding = Math.max(
		AnnotationCacheGeometry.SelectionPadding,
		strokePadding,
		blurPadding,
	);
	return clampRegion(
		{
			x: Math.floor(bounds.x - padding),
			y: Math.floor(bounds.y - padding),
			width: Math.ceil(bounds.width + padding * 2),
			height: Math.ceil(bounds.height + padding * 2),
		},
		canvasWidth,
		canvasHeight,
	);
}

function unionRegion(left: RenderRegion, right: RenderRegion): RenderRegion {
	const x = Math.min(left.x, right.x);
	const y = Math.min(left.y, right.y);
	const rightEdge = Math.max(left.x + left.width, right.x + right.width);
	const bottomEdge = Math.max(left.y + left.height, right.y + right.height);
	return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

function clampRegion(
	region: RenderRegion,
	canvasWidth: number,
	canvasHeight: number,
): RenderRegion {
	const x = Math.max(0, region.x);
	const y = Math.max(0, region.y);
	const right = Math.min(canvasWidth, region.x + region.width);
	const bottom = Math.min(canvasHeight, region.y + region.height);
	return {
		x,
		y,
		width: Math.max(0, right - x),
		height: Math.max(0, bottom - y),
	};
}

function hasArea(region: RenderRegion): boolean {
	return region.width > 0 && region.height > 0;
}
