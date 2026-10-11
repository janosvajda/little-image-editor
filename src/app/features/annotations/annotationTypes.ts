import { LineEnd, type LineEnds } from './lineEnd';
import type { FillRule, PathContour } from '../../core/geometry/vectorPath';
import type { Gradient } from '../../core/geometry/gradient';
import type { FillPattern } from '../../core/geometry/fillPattern';
import type {
	CropRect,
	PaintTool,
	Point,
	ShapeTool,
} from '../../core/document/appTypes';
import type { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import type { RectOrientation } from '../../core/geometry/geometryHelpers';
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
	/** A line through several points, with bends, as one item: a diagram link, for example. */
	Connector: 'connector',
	/** A vector path of straight lines and curves, as SVG draws one. */
	Path: 'path',
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

/** A drop shadow, as SVG's feDropShadow draws one: its colour and opacity, how far it falls and how soft it is. */
export interface ItemShadow {
	readonly color: string;
	readonly opacity: number;
	/** How far it falls, in image pixels. */
	readonly offset: Point;
	/** How soft it is: the spread of its blur, as SVG's stdDeviation. */
	readonly softness: number;
}

/** Effects any item can have, as SVG filters give them: a blur, and a drop shadow under it. */
export interface ItemEffects {
	/** How far the item is blurred: the spread of its blur, as SVG's stdDeviation. */
	readonly blur?: number;
	readonly shadow?: ItemShadow;
}

/**
 * A shape an item shows only inside of, as SVG's clipPath. Its points are
 * relative to the item's frame, from 0 to 1 on each side, so the clip moves,
 * stretches and turns with its item.
 */
export interface ItemClip {
	readonly contours: PathContour[];
	readonly fillRule?: FillRule;
}

/** One editable item: a shape, a brush stroke, a text and so on. Items live in content layers. */
interface AnnotationBase extends ErasableAnnotation {
	id: string;
	type: AnnotationObjectType;
	rotation?: number;
	visible?: boolean;
	locked?: boolean;
	effects?: ItemEffects;
	clip?: ItemClip;
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

export const LineDash = { Solid: 'solid', Dashed: 'dashed' } as const;
export type LineDash = (typeof LineDash)[keyof typeof LineDash];

export interface ConnectorAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Connector;
	/** The path from its first point to its last; straight pieces join them. */
	points: Point[];
	color: string;
	width: number;
	opacity: number;
	/** An arrowhead at the last point; `head` names another end instead. */
	arrow: boolean;
	dash: LineDash;
	/** The end at the last point, when it is not the plain arrowhead `arrow` asks for. */
	head?: LineEnd;
	/** The end at the first point; none when absent. */
	tail?: LineEnd;
}

export interface PathAnnotation extends AnnotationBase {
	type: typeof AnnotationObjectTypeId.Path;
	contours: PathContour[];
	/** The line's colour; for a filled path without `fillColor`, the fill's too. */
	color: string;
	width: number;
	opacity: number;
	/** Whether its closed contours are filled. */
	fill: boolean;
	fillColor?: string;
	fillGradient?: Gradient;
	fillPattern?: FillPattern;
	lineGradient?: Gradient;
	fillRule?: FillRule;
	dash: LineDash;
	/** The end at the path's last point, and at its first, when its contour is open. */
	head?: LineEnd;
	tail?: LineEnd;
}

/** A connector's ends: its named ones, and otherwise the arrowhead its `arrow` flag asks for. */
export function connectorEnds(connector: Pick<ConnectorAnnotation, 'arrow' | 'head' | 'tail'>): LineEnds {
	return { head: connector.head ?? (connector.arrow ? LineEnd.Arrow : LineEnd.None), tail: connector.tail ?? LineEnd.None };
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

export interface ShapeAnnotation extends AnnotationBase, RectOrientation {
	type: typeof AnnotationObjectTypeId.Shape;
	shape: ShapeTool;
	rect: CropRect;
	/** The outline's colour; for a filled shape without `fillColor`, the fill's too. */
	color: string;
	width: number;
	opacity: number;
	fill: boolean;
	/** A filled shape's own fill colour, drawn under an outline in `color`. */
	fillColor?: string;
	/** A gradient the shape is filled with instead of a single colour. */
	fillGradient?: Gradient;
	/** A pattern the shape is filled with instead of a single colour. */
	fillPattern?: FillPattern;
	/** A gradient its outline is drawn in instead of `color`. */
	lineGradient?: Gradient;
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
	| RasterFragmentAnnotation
	| ConnectorAnnotation
	| PathAnnotation;

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
