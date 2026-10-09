import type { AnnotationRenderState } from './annotationDocument';
import { annotationBounds } from './annotationDocument';
import { PaintToolId } from '../../core/document/appTypes';
import { ShapeHandleMetrics } from '../../core/geometry/shapeTransformHelpers';
import {
	renderAnnotationObject,
	renderAnnotationSelection,
	renderContentLayers,
	renderObjectErasureTail,
	renderStrokeTail,
	supportsIncrementalStrokeRendering,
} from './annotationRenderer';
import type {
	AnnotationObject,
	AnnotationState,
	AnnotationStateInput,
	ContentLayer,
} from './annotationTypes';
import { withContentLayers } from './contentLayerStructure';
import { LayerMotionPreview } from './layerMotionPreview';
import { AnnotationObjectTypeId } from './annotationTypes';
import { hasDefaultCompositing } from '../layers/layerAppearance';
import {
	compositeLayer,
	compositeLayers,
	layerHolding,
} from '../layers/layerCompositing';

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
	/** Content stacked above the item being edited, so it stays in front while dragged. */
	readonly #aboveCanvas = document.createElement('canvas');
	readonly #aboveContext = this.#aboveCanvas.getContext('2d')!;
	#hasAbove = false;
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
	readonly #layerMotion = new LayerMotionPreview();
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

	/** How often whole-layer drag surfaces were drawn; one per drag. */
	get layerMotionBuilds(): number {
		return this.#layerMotion.builds;
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
		this.#hasAbove = false;
		this.resetInteractiveFrame();
	}

	render(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		input: Readonly<AnnotationStateInput>,
		renderState: AnnotationRenderState,
		selected: AnnotationObject | null,
		interactive: AnnotationObject | null,
		imageBackdrop: HTMLCanvasElement | null = null,
	): void {
		const state = withContentLayers(input);
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
		if (this.renderLayerMotion(target, baseCanvas, state, renderState, interactive, selected))
			return;
		const excludedId = interactive?.id ?? null;
		const promoted = this.promoteCommittedInteractive(
			baseCanvas,
			state,
			renderState,
			excludedId,
		);
		const excludedIsTopmost =
			excludedId !== null && state.objects.at(-1)?.id === excludedId;
		const cacheReused =
			promoted || this.canReuse(renderState, excludedId, excludedIsTopmost);
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
		const interactiveLayer = interactive ? layerHolding(state, interactive.id) : null;
		if (dirtyRegion)
			this.composeRegion(
				target,
				baseCanvas,
				interactive!,
				interactiveLayer,
				selected,
				dirtyRegion,
			);
		else
			this.composeFull(target, baseCanvas, interactive, interactiveLayer, selected);

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
		renderContentLayers(target, baseCanvas, state);
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
		interactiveLayer: ContentLayer | null,
		selected: AnnotationObject | null,
	): void {
		target.clearRect(0, 0, target.canvas.width, target.canvas.height);
		target.drawImage(this.#canvas, 0, 0);
		if (interactive)
			this.compositeInteractiveObject(
				target,
				baseCanvas,
				interactive,
				interactiveLayer,
			);
		if (this.#hasAbove) target.drawImage(this.#aboveCanvas, 0, 0);
		if (selected) renderAnnotationSelection(target, selected);
		this.#fullComposites += 1;
	}

	private composeRegion(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		interactive: AnnotationObject,
		interactiveLayer: ContentLayer | null,
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
		this.compositeInteractiveObject(
			target,
			baseCanvas,
			interactive,
			interactiveLayer,
		);
		if (this.#hasAbove) target.drawImage(this.#aboveCanvas, 0, 0);
		if (selected) renderAnnotationSelection(target, selected);
		target.restore();
		this.#dirtyComposites += 1;
	}

	private canReuse(
		renderState: AnnotationRenderState,
		excludedId: string | null,
		excludedIsTopmost: boolean,
	): boolean {
		if (excludedId !== this.#excludedObjectId) {
			// A new topmost item, such as a stroke being drawn, is simply drawn over the cache.
			if (
				excludedId !== null &&
				excludedIsTopmost &&
				this.#excludedObjectId === null &&
				!this.#cachedObjectIds.has(excludedId) &&
				renderState.interactionActive &&
				renderState.changedObjectId === excludedId &&
				renderState.staticRevision === this.#cachedStaticRevision
			) {
				this.#excludedObjectId = excludedId;
				this.#excludedObjectCanPromote = true;
				this.#hasAbove = false;
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
		const layer = layerHolding(state, committed.id);
		// A group-composited layer must be redrawn as a whole to stay isolated.
		if (
			(committed.type === AnnotationObjectTypeId.Stroke &&
				isTransformedStroke(committed)) ||
			(layer !== null && !hasDefaultCompositing(layer))
		)
			return false;
		this.compositeInteractiveObject(this.#context, baseCanvas, committed, layer);
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
		this.#aboveContext.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
		if (this.#imageBackdrop) this.#context.drawImage(this.#imageBackdrop, 0, 0);
		const objects = excludedId
			? state.objects.filter((object) => object.id !== excludedId)
			: state.objects;
		const draw = (context: CanvasRenderingContext2D, item: AnnotationObject) =>
			this.drawCachedItem(context, baseCanvas, item);
		const excludedIndex = excludedId
			? state.objects.findIndex((object) => object.id === excludedId)
			: -1;
		if (excludedIndex < 0) compositeLayers(this.#context, state, draw);
		else {
			const order = new Map(state.objects.map((object, index) => [object.id, index]));
			const below = (item: AnnotationObject) => order.get(item.id)! < excludedIndex;
			const above = (item: AnnotationObject) => order.get(item.id)! > excludedIndex;
			compositeLayers(this.#context, state, draw, below);
			compositeLayers(this.#aboveContext, state, draw, above);
		}
		this.#hasAbove =
			excludedIndex >= 0 && excludedIndex < state.objects.length - 1;
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

	/**
	 * A whole layer being dragged is shifted on prepared surfaces instead of
	 * redrawn; returns whether this frame was drawn that way. When the drag
	 * ends the surfaces are released and the next frame redraws everything.
	 */
	private renderLayerMotion(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		state: Readonly<AnnotationState>,
		renderState: AnnotationRenderState,
		interactive: AnnotationObject | null,
		selected: AnnotationObject | null,
	): boolean {
		const motion = renderState.layerMotion;
		const previewed =
			motion !== undefined &&
			interactive === null &&
			this.#layerMotion.canPreview(state, motion.layerId) &&
			this.#layerMotion.render(target, state, motion, this.#imageBackdrop, (context, item) =>
				this.drawCachedItem(context, baseCanvas, item),
			);
		if (previewed) {
			if (selected) renderAnnotationSelection(target, selected);
			this.#fullComposites += 1;
			return true;
		}
		this.#layerMotion.reset();
		return false;
	}

	/** A stroke moved by whole pixels draws from its cached source, exactly as while dragged. */
	private drawCachedItem(
		context: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		item: AnnotationObject,
	): void {
		if (isShiftedStroke(item)) this.renderInteractiveObject(context, baseCanvas, item);
		else renderAnnotationObject(context, baseCanvas, item);
	}

	private compositeInteractiveObject(
		target: CanvasRenderingContext2D,
		baseCanvas: HTMLCanvasElement,
		object: AnnotationObject,
		layer: ContentLayer | null,
	): void {
		compositeLayer(target, layer, (layerContext) =>
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
		this.#aboveCanvas.width = width;
		this.#aboveCanvas.height = height;
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
			isShiftedStroke(object)
		) {
			this.cacheStrokeSource(baseCanvas, object);
			const source = object.sourceRect;
			target.drawImage(
				this.#interactiveCanvas,
				object.rect.x - source.x,
				object.rect.y - source.y,
			);
			this.#transformedInteractiveStrokeId = object.id;
			return;
		}
		// Resized or rotated strokes are drawn from their points, so their line
		// keeps its width and stays sharp instead of being a scaled picture.
		if (
			object.type !== AnnotationObjectTypeId.Stroke ||
			object.tool === PaintToolId.Eraser ||
			isTransformedStroke(object)
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

/**
 * A stroke only moved by whole pixels since it was drawn: its cached source
 * can be drawn shifted with no change to its pixels.
 */
function isShiftedStroke(
	object: AnnotationObject,
): object is Extract<
	AnnotationObject,
	{ type: typeof AnnotationObjectTypeId.Stroke }
> & { sourceRect: RenderRegion } {
	if (!isTransformedStroke(object) || object.rotation) return false;
	const source = object.sourceRect;
	return (
		object.rect.width === source.width &&
		object.rect.height === source.height &&
		Number.isInteger(object.rect.x - source.x) &&
		Number.isInteger(object.rect.y - source.y)
	);
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
