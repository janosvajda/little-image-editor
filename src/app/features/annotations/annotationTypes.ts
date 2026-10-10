import type {
	CropRect,
	PaintTool,
	Point,
	ShapeTool,
} from '../../core/document/appTypes';
import type { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import type { FloodFillRun } from '../drawing/floodFillHelpers';

/** The kinds of item a content layer holds. */
export const AnnotationObjectTypeId = {
	Arrow: 'arrow',
	Step: 'step',
	Box: 'box',
	Highlight: 'highlight',
	Text: 'text',
	Blur: 'blur',
	Redact: 'redact',
	Shape: 'shape',
	Stroke: 'stroke',
	Fill: 'fill',
	RasterFragment: 'rasterFragment',
} as const;
export type AnnotationObjectType =
	(typeof AnnotationObjectTypeId)[keyof typeof AnnotationObjectTypeId];

export interface ObjectErasurePoint {
	readonly xRatio: number;
	readonly yRatio: number;
	readonly pressure: number;
}

export interface ObjectErasurePath {
	readonly points: ObjectErasurePoint[];
	readonly sizeRatio: number;
	readonly opacity: number;
	readonly hardness: number;
	strokePointLimit?: number;
}

interface ErasableAnnotation {
	erasures?: ObjectErasurePath[];
	erasureRevision?: number;
	pixelCutouts?: ObjectPixelMask[];
	pixelClips?: ObjectPixelMask[];
}

export interface ObjectPixelMask {
	readonly points: ReadonlyArray<Readonly<{ xRatio: number; yRatio: number }>>;
	strokePointLimit?: number;
	strokeSourceRect?: CropRect;
}

/** One editable item: a shape, a brush stroke, a text and so on. Items live in content layers. */
interface AnnotationBase extends ErasableAnnotation {
	id: string;
	type: AnnotationObjectType;
	rotation?: number;
	visible?: boolean;
	locked?: boolean;
}

export interface StrokePoint extends Point {
	readonly pressure: number;
}

export interface StrokePathStyle {
	readonly startIndex: number;
	readonly tool: PaintTool;
	color: string;
	size: number;
	opacity: number;
	hardness: number;
	readonly seed: number;
}

export interface StrokeAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Stroke;
	layerId: typeof CoreLayerId.Objects;
	tool: PaintTool;
	points: StrokePoint[];
	pathStarts?: number[];
	pathStyles?: StrokePathStyle[];
	sourceRect?: CropRect;
	rect: CropRect;
	color: string;
	size: number;
	opacity: number;
	hardness: number;
	seed: number;
}

export interface FillAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Fill;
	layerId: typeof CoreLayerId.Objects;
	rect: CropRect;
	runs: FloodFillRun[];
	color: string;
	opacity: number;
	tolerance: number;
}

export interface RasterFragmentAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.RasterFragment;
	rect: CropRect;
	pixelWidth: number;
	pixelHeight: number;
	pixels: string;
}

export interface ArrowAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Arrow;
	from: Point;
	to: Point;
	color: string;
	width: number;
}

export interface RectAnnotation extends AnnotationBase {
	type:
		| typeof AnnotationObjectTypeId.Box
		| typeof AnnotationObjectTypeId.Highlight
		| typeof AnnotationObjectTypeId.Blur
		| typeof AnnotationObjectTypeId.Redact;
	rect: CropRect;
	color: string;
	width: number;
	opacity: number;
	blur: number;
	rotation?: number;
}

export interface ShapeAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Shape;
	shape: ShapeTool;
	rect: CropRect;
	color: string;
	width: number;
	opacity: number;
	fill: boolean;
}

export interface StepAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Step;
	at: Point;
	value: number;
	color: string;
	size: number;
}

export interface TextAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Text;
	at: Point;
	text: string;
	color: string;
	size: number;
	rect?: CropRect;
}

export type AnnotationObject =
	| ArrowAnnotation
	| RectAnnotation
	| StepAnnotation
	| TextAnnotation
	| ShapeAnnotation
	| StrokeAnnotation
	| FillAnnotation
	| RasterFragmentAnnotation;

export const LinkedHistoryDomain = {
	Document: 'document',
} as const;
export type LinkedHistoryDomain =
	(typeof LinkedHistoryDomain)[keyof typeof LinkedHistoryDomain];

/**
 * A layer above the image that holds items. Opacity and blend mode apply to the
 * layer's items as one group; unset values resolve through `layerAppearance()`.
 */
export interface ContentLayer {
	id: string;
	name: string;
	/** The layer's items, bottom first. */
	itemIds: string[];
	visible?: boolean;
	locked?: boolean;
	opacity?: number;
	blendMode?: BlendMode;
	/** Degrees the layer's frame is turned; its items turn with it. */
	rotation?: number;
}

/**
 * `layers` is the source of truth for structure, bottom layer first;
 * `objects` holds every item in render order and always follows `layers`.
 */
export interface AnnotationState {
	objects: AnnotationObject[];
	layers: ContentLayer[];
	nextStep: number;
}

/** A state from a caller that may predate content layers; the document completes it. */
export type AnnotationStateInput = Omit<AnnotationState, 'layers'> & {
	layers?: ContentLayer[];
};

/** Saved document history; states without layers are completed on restore. */
export interface AnnotationSessionState {
	state: AnnotationStateInput;
	history: AnnotationStateInput[];
	historyIndex: number;
	historyLinks?: Array<LinkedHistoryDomain | null>;
}

