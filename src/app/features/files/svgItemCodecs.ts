import { type CropRect, type PaintTool, PaintToolId, type ShapeTool, ShapeToolId } from '../../core/document/appTypes';
import { CoreLayerId } from '../../core/layers/layerTypes';
import { type Gradient, reframedGradient } from '../../core/geometry/gradient';
import { pathBounds } from '../../core/geometry/vectorPath';
import {
	type AnnotationObject,
	type AnnotationObjectType,
	AnnotationObjectTypeId,
	type ObjectErasurePath,
	type ObjectPixelMask,
	type PathAnnotation,
	type RectAnnotation,
	type ShapeAnnotation,
	type StrokeAnnotation,
	type StrokePathStyle,
} from '../annotations/annotationTypes';
import {
	entriesValue,
	frameValue,
	numberAttribute,
	numberList,
	parseEntries,
	parseFrame,
	parseTriples,
	type SvgAttributes,
	SvgDataAttribute,
	SvgFlip,
	SVG_NONE,
	triplesValue,
} from './svgItemFormat';
import { svgNumber } from './svgRecordingContext';

/**
 * Each kind of item as an SVG group: what its group says beyond its drawing,
 * and the item again from those words and the items its drawing reads as.
 * The table is keyed by item type, so a new kind of item does not compile
 * until it says how it is kept in an SVG.
 */

/** The item a kind of item is: the one whose kinds include it, as one item type covers every marked area. */
export type ItemOf<Type extends AnnotationObjectType, Item = AnnotationObject> = Item extends { type: infer Kinds } ? (Type extends Kinds ? Item : never) : never;

/**
 * What an item's drawing is to its reading: read back as the item's geometry;
 * only rendered from what the group says, as a brush stroke's dots are from
 * its points and seed; or the item's own pixels, a picture placed as the
 * group places it.
 */
export const SvgItemDrawing = { Read: 'read', Rendered: 'rendered', Picture: 'picture' } as const;
export type SvgItemDrawing = (typeof SvgItemDrawing)[keyof typeof SvgItemDrawing];

export interface SvgItemCodec<Item extends AnnotationObject> {
	readonly drawing: SvgItemDrawing;
	/** What the item's group says that its drawing cannot. */
	attributes(item: Item): SvgAttributes;
	/**
	 * The item, unturned, from its group and what its drawing reads as; null
	 * when the drawing is no longer this kind of item, edited elsewhere, so it
	 * is read as the drawing it now is.
	 */
	read(group: Element, drawn: readonly AnnotationObject[]): Item | null;
}

type SvgItemCodecs = { readonly [Type in AnnotationObjectType]: SvgItemCodec<ItemOf<Type>> };

/** Shapes SVG has elements of its own for; the others are paths, whose frame the group keeps. */
const ELEMENT_SHAPES: ReadonlySet<ShapeTool> = new Set([ShapeToolId.Rectangle, ShapeToolId.Ellipse]);

const NO_ATTRIBUTES: SvgAttributes = {};

function only<Type extends AnnotationObjectType>(drawn: readonly AnnotationObject[], type: Type): ItemOf<Type> | null {
	const [first] = drawn;
	return drawn.length === 1 && first?.type === type ? (first as ItemOf<Type>) : null;
}

function first<Type extends AnnotationObjectType>(drawn: readonly AnnotationObject[], ...types: Type[]): ItemOf<Type> | null {
	return (drawn.find((item) => types.some((type) => type === item.type)) as ItemOf<Type> | undefined) ?? null;
}

function newId(): string {
	return crypto.randomUUID();
}

/** An item that is drawn exactly by its drawing: read back as it is. */
function drawnAs<Type extends AnnotationObjectType>(type: Type): SvgItemCodec<ItemOf<Type>> {
	return { drawing: SvgItemDrawing.Read, attributes: () => NO_ATTRIBUTES, read: (_group, drawn) => only(drawn, type) };
}

// Shapes

/** Whether a shape's line is drawn: it has a width, and it is not a fill in its own colour alone. */
function drawsLine(shape: ShapeAnnotation): boolean {
	return shape.width > 0 && (!shape.fill || hasOwnFill(shape));
}

function hasOwnFill(shape: Pick<ShapeAnnotation, 'fillColor' | 'fillGradient' | 'fillPattern'>): boolean {
	return shape.fillColor !== undefined || shape.fillGradient !== undefined || shape.fillPattern !== undefined;
}

function flipOf({ flipX, flipY }: ShapeAnnotation): SvgFlip | undefined {
	if (flipX && flipY) return SvgFlip.Both;
	if (flipX) return SvgFlip.X;
	return flipY ? SvgFlip.Y : undefined;
}

function shapeKind(value: string | null): ShapeTool | null {
	return Object.values(ShapeToolId).find((kind) => kind === value) ?? null;
}

const shapeCodec: SvgItemCodec<ShapeAnnotation> = {
	drawing: SvgItemDrawing.Read,
	attributes(shape) {
		const line = drawsLine(shape);
		const shown = shape.fill || line;
		// The shape's colour shows as its line, or as its fill when that is its colour alone.
		const colorShown = (line && !shape.lineGradient) || (shape.fill && !hasOwnFill(shape));
		return {
			[SvgDataAttribute.Shape]: shape.shape,
			[SvgDataAttribute.Flip]: flipOf(shape),
			[SvgDataAttribute.Frame]: ELEMENT_SHAPES.has(shape.shape) && shown ? undefined : frameValue(shape.rect),
			// A colour that is not shown is still the shape's, for when its line is drawn in it again.
			[SvgDataAttribute.Color]: colorShown ? undefined : shape.color,
			[SvgDataAttribute.Width]: !line && shape.width > 0 ? shape.width : undefined,
			[SvgDataAttribute.Opacity]: shown ? undefined : shape.opacity,
		};
	},
	read(group, drawn) {
		const kind = shapeKind(group.getAttribute(SvgDataAttribute.Shape));
		const painted = first(drawn, AnnotationObjectTypeId.Shape, AnnotationObjectTypeId.Path);
		const rect = parseFrame(group.getAttribute(SvgDataAttribute.Frame)) ?? (painted?.type === AnnotationObjectTypeId.Shape ? painted.rect : null);
		if (!kind || !rect) return null;
		const flip = group.getAttribute(SvgDataAttribute.Flip);
		return {
			id: newId(),
			type: AnnotationObjectTypeId.Shape,
			shape: kind,
			rect,
			...shapePaint(group, painted, rect),
			...(flip === SvgFlip.X || flip === SvgFlip.Both ? { flipX: true } : {}),
			...(flip === SvgFlip.Y || flip === SvgFlip.Both ? { flipY: true } : {}),
		};
	},
};

type ShapePaint = Pick<ShapeAnnotation, 'color' | 'width' | 'opacity' | 'fill' | 'fillColor' | 'fillGradient' | 'fillPattern' | 'lineGradient'>;

/** A shape's paint from its drawing, with what the drawing does not show from its group; its gradients laid over its own frame. */
function shapePaint(group: Element, painted: ShapeAnnotation | PathAnnotation | null, rect: CropRect): ShapePaint {
	const color = group.getAttribute(SvgDataAttribute.Color);
	const width = numberAttribute(group, SvgDataAttribute.Width);
	if (!painted) return { color: color ?? '', width: width ?? 0, opacity: numberAttribute(group, SvgDataAttribute.Opacity) ?? 1, fill: false };
	const frame = painted.type === AnnotationObjectTypeId.Shape ? painted.rect : pathBounds(painted.contours);
	const reframe = (gradient: Gradient | undefined) => (gradient ? { gradient: reframedGradient(gradient, frame, rect) } : null);
	const fillGradient = reframe(painted.fillGradient);
	const lineGradient = reframe(painted.lineGradient);
	// A fill drawn without a line reads as the shape's colour; a line colour kept aside makes it the fill's own.
	const ownFill = color !== null && painted.fill && !painted.fillGradient && !painted.fillPattern && painted.fillColor === undefined;
	return {
		color: color ?? painted.color,
		width: width ?? painted.width,
		opacity: painted.opacity,
		fill: painted.fill,
		...(ownFill ? { fillColor: painted.color } : painted.fillColor === undefined ? {} : { fillColor: painted.fillColor }),
		...(fillGradient ? { fillGradient: fillGradient.gradient } : {}),
		...(painted.fillPattern ? { fillPattern: painted.fillPattern } : {}),
		...(lineGradient ? { lineGradient: lineGradient.gradient } : {}),
	};
}

// Markup

/** What a marked area's drawing shows of it: its outline's colour and width, or its fill's colour and fading. */
interface RectDrawing {
	readonly color: boolean;
	readonly width: boolean;
	readonly opacity: boolean;
}

function rectCodec(type: RectAnnotation['type'], drawing: RectDrawing): SvgItemCodec<RectAnnotation> {
	return {
		// A blur shows the picture under it, not itself, so it is rendered from what its group says.
		drawing: drawing.color ? SvgItemDrawing.Read : SvgItemDrawing.Rendered,
		attributes: (area) => ({
			[SvgDataAttribute.Color]: drawing.color ? undefined : area.color,
			[SvgDataAttribute.Width]: drawing.width ? undefined : area.width,
			[SvgDataAttribute.Opacity]: drawing.opacity ? undefined : area.opacity,
			[SvgDataAttribute.Blur]: area.blur || undefined,
			[SvgDataAttribute.Frame]: drawing.color ? undefined : frameValue(area.rect),
		}),
		read(group, drawn) {
			const shape = only(drawn, AnnotationObjectTypeId.Shape);
			const rect = parseFrame(group.getAttribute(SvgDataAttribute.Frame)) ?? shape?.rect;
			const color = group.getAttribute(SvgDataAttribute.Color) ?? shape?.color;
			if (!rect || color === undefined) return null;
			return {
				id: newId(),
				type,
				rect,
				color,
				width: numberAttribute(group, SvgDataAttribute.Width) ?? shape?.width ?? 0,
				opacity: numberAttribute(group, SvgDataAttribute.Opacity) ?? shape?.opacity ?? 1,
				blur: numberAttribute(group, SvgDataAttribute.Blur) ?? 0,
			};
		},
	};
}

const stepCodec: SvgItemCodec<ItemOf<typeof AnnotationObjectTypeId.Step>> = {
	drawing: SvgItemDrawing.Read,
	attributes: () => NO_ATTRIBUTES,
	read(_group, drawn) {
		const disc = first(drawn, AnnotationObjectTypeId.Shape);
		const label = first(drawn, AnnotationObjectTypeId.Text);
		const value = Number(label?.text);
		if (disc?.shape !== ShapeToolId.Ellipse || !Number.isInteger(value)) return null;
		const { x, y, width } = disc.rect;
		return { id: newId(), type: AnnotationObjectTypeId.Step, at: { x: x + width / 2, y: y + disc.rect.height / 2 }, value, color: disc.color, size: width };
	},
};

const arrowCodec: SvgItemCodec<ItemOf<typeof AnnotationObjectTypeId.Arrow>> = {
	drawing: SvgItemDrawing.Read,
	attributes: () => NO_ATTRIBUTES,
	read(_group, drawn) {
		const line = only(drawn, AnnotationObjectTypeId.Connector);
		const [from] = line?.points ?? [];
		const to = line?.points.at(-1);
		if (!line || !from || !to) return null;
		return { id: newId(), type: AnnotationObjectTypeId.Arrow, from, to, color: line.color, width: line.width };
	},
};

/** Pixels cut or pasted in: a picture, which is all it is, read as the picture it is. */
const rasterFragmentCodec: SvgItemCodec<ItemOf<typeof AnnotationObjectTypeId.RasterFragment>> = {
	drawing: SvgItemDrawing.Picture,
	attributes: () => NO_ATTRIBUTES,
	read: () => null,
};

// Paint

function paintTool(value: string | undefined | null): PaintTool | null {
	return Object.values(PaintToolId).find((tool) => tool === value) ?? null;
}

/** A style entry: where it starts, its tool, colour, size, opacity, hardness and seed. */
const STYLE_WORDS = 7;

function styleEntry({ startIndex, tool, color, size, opacity, hardness, seed }: StrokePathStyle): (string | number)[] {
	return [startIndex, tool, color, size, opacity, hardness, seed];
}

function parsedStyle(words: readonly string[]): StrokePathStyle | null {
	const [start, tool, color, size, opacity, hardness, seed] = words;
	const numbers = [start, size, opacity, hardness, seed].map(Number);
	const kind = paintTool(tool);
	if (words.length !== STYLE_WORDS || !kind || !color || !numbers.every(Number.isFinite)) return null;
	const [startIndex, sizeValue, opacityValue, hardnessValue, seedValue] = numbers as [number, number, number, number, number];
	return { startIndex, tool: kind, color, size: sizeValue, opacity: opacityValue, hardness: hardnessValue, seed: seedValue };
}

/**
 * A brush stroke: its points and the pressure at each, its tool and its
 * styles are what it is; its drawing, the brush's marks in SVG, is rendered
 * from them, as a spray's dots are scattered again from its seed.
 */
const strokeCodec: SvgItemCodec<StrokeAnnotation> = {
	drawing: SvgItemDrawing.Rendered,
	attributes: (stroke) => ({
		[SvgDataAttribute.Tool]: stroke.tool,
		[SvgDataAttribute.Points]: triplesValue(stroke.points.map(({ x, y, pressure }) => [x, y, pressure])),
		[SvgDataAttribute.PathStarts]: stroke.pathStarts?.length ? stroke.pathStarts.join(' ') : undefined,
		[SvgDataAttribute.Styles]: stroke.pathStyles?.length ? entriesValue(stroke.pathStyles.map(styleEntry)) : undefined,
		[SvgDataAttribute.Frame]: frameValue(stroke.rect),
		[SvgDataAttribute.SourceFrame]: stroke.sourceRect ? frameValue(stroke.sourceRect) : undefined,
		[SvgDataAttribute.Color]: stroke.color,
		[SvgDataAttribute.Size]: stroke.size,
		[SvgDataAttribute.Opacity]: stroke.opacity,
		[SvgDataAttribute.Hardness]: stroke.hardness,
		[SvgDataAttribute.Seed]: stroke.seed,
	}),
	read(group) {
		const tool = paintTool(group.getAttribute(SvgDataAttribute.Tool));
		const points = parseTriples(group.getAttribute(SvgDataAttribute.Points));
		const rect = parseFrame(group.getAttribute(SvgDataAttribute.Frame));
		const color = group.getAttribute(SvgDataAttribute.Color);
		const [size, opacity, hardness, seed] = [SvgDataAttribute.Size, SvgDataAttribute.Opacity, SvgDataAttribute.Hardness, SvgDataAttribute.Seed].map((name) => numberAttribute(group, name));
		const styles = parseEntries(group.getAttribute(SvgDataAttribute.Styles)).map(parsedStyle);
		if (!tool || !points || !rect || !color || size === undefined || opacity === undefined || hardness === undefined || seed === undefined || styles.includes(null)) return null;
		const pathStarts = numberList(group.getAttribute(SvgDataAttribute.PathStarts));
		const sourceRect = parseFrame(group.getAttribute(SvgDataAttribute.SourceFrame));
		return {
			id: newId(),
			type: AnnotationObjectTypeId.Stroke,
			layerId: CoreLayerId.Objects,
			tool,
			points: points.map(([x, y, pressure]) => ({ x, y, pressure })),
			...(pathStarts.length ? { pathStarts } : {}),
			...(styles.length ? { pathStyles: styles as StrokePathStyle[] } : {}),
			...(sourceRect ? { sourceRect } : {}),
			rect,
			color,
			size,
			opacity,
			hardness,
			seed,
		};
	},
};

/** A fill: its rows of pixels are what it is; its drawing, one path of them, is rendered from them. */
const fillCodec: SvgItemCodec<ItemOf<typeof AnnotationObjectTypeId.Fill>> = {
	drawing: SvgItemDrawing.Rendered,
	attributes: (fill) => ({
		[SvgDataAttribute.Runs]: triplesValue(fill.runs.map(({ x, y, length }) => [x, y, length])),
		[SvgDataAttribute.Frame]: frameValue(fill.rect),
		[SvgDataAttribute.Color]: fill.color,
		[SvgDataAttribute.Opacity]: fill.opacity,
		[SvgDataAttribute.Tolerance]: fill.tolerance,
	}),
	read(group) {
		const runs = parseTriples(group.getAttribute(SvgDataAttribute.Runs));
		const rect = parseFrame(group.getAttribute(SvgDataAttribute.Frame));
		const color = group.getAttribute(SvgDataAttribute.Color);
		const opacity = numberAttribute(group, SvgDataAttribute.Opacity);
		const tolerance = numberAttribute(group, SvgDataAttribute.Tolerance);
		if (!runs || !rect || !color || opacity === undefined || tolerance === undefined) return null;
		return {
			id: newId(),
			type: AnnotationObjectTypeId.Fill,
			layerId: CoreLayerId.Objects,
			rect,
			runs: runs.map(([x, y, length]) => ({ x, y, length })),
			color,
			opacity,
			tolerance,
		};
	},
};

export const SVG_ITEM_CODECS: SvgItemCodecs = {
	[AnnotationObjectTypeId.Shape]: shapeCodec,
	[AnnotationObjectTypeId.Path]: drawnAs(AnnotationObjectTypeId.Path),
	[AnnotationObjectTypeId.Connector]: drawnAs(AnnotationObjectTypeId.Connector),
	[AnnotationObjectTypeId.Text]: drawnAs(AnnotationObjectTypeId.Text),
	[AnnotationObjectTypeId.Arrow]: arrowCodec,
	[AnnotationObjectTypeId.Step]: stepCodec,
	[AnnotationObjectTypeId.Box]: rectCodec(AnnotationObjectTypeId.Box, { color: true, width: true, opacity: false }),
	[AnnotationObjectTypeId.Highlight]: rectCodec(AnnotationObjectTypeId.Highlight, { color: true, width: false, opacity: true }),
	[AnnotationObjectTypeId.Redact]: rectCodec(AnnotationObjectTypeId.Redact, { color: true, width: false, opacity: false }),
	[AnnotationObjectTypeId.Blur]: rectCodec(AnnotationObjectTypeId.Blur, { color: false, width: false, opacity: false }),
	[AnnotationObjectTypeId.Stroke]: strokeCodec,
	[AnnotationObjectTypeId.Fill]: fillCodec,
	[AnnotationObjectTypeId.RasterFragment]: rasterFragmentCodec,
};

// Erasing, cutting and keeping, which any item can have

type Erasable = Pick<AnnotationObject, 'erasures' | 'pixelCutouts' | 'pixelClips'>;

function optionalWord(value: number | undefined): string | number {
	return value === undefined ? SVG_NONE : value;
}

function optionalNumber(word: string | undefined): number | undefined | null {
	if (word === SVG_NONE) return undefined;
	const value = Number(word);
	return word !== undefined && Number.isFinite(value) ? value : null;
}

/** An eraser stroke: size, opacity, hardness and when it was made, then its points with their pressure. */
function erasureEntry({ sizeRatio, opacity, hardness, strokePointLimit, points }: ObjectErasurePath): (string | number)[] {
	return [sizeRatio, opacity, hardness, optionalWord(strokePointLimit), ...points.map(({ xRatio, yRatio, pressure }) => triplesValue([[xRatio, yRatio, pressure]]))];
}

function parsedErasure(words: readonly string[]): ObjectErasurePath | null {
	const [sizeRatio, opacity, hardness] = words.slice(0, ERASURE_HEADER - 1).map(Number);
	const limit = optionalNumber(words[ERASURE_HEADER - 1]);
	const points = words.slice(ERASURE_HEADER).map((word) => parseTriples(word)?.[0]);
	if (![sizeRatio, opacity, hardness].every(Number.isFinite) || limit === null || !points.length || points.includes(undefined)) return null;
	return {
		points: (points as [number, number, number][]).map(([xRatio, yRatio, pressure]) => ({ xRatio, yRatio, pressure })),
		sizeRatio: sizeRatio!,
		opacity: opacity!,
		hardness: hardness!,
		...(limit === undefined ? {} : { strokePointLimit: limit }),
	};
}

/** A cut: when it was made, the frame it was made in, then its outline. */
function maskEntry({ strokePointLimit, strokeSourceRect, points }: ObjectPixelMask): (string | number)[] {
	return [optionalWord(strokePointLimit), strokeSourceRect ? frameValue(strokeSourceRect).replaceAll(' ', ',') : SVG_NONE, ...points.map(({ xRatio, yRatio }) => `${svgNumber(xRatio)},${svgNumber(yRatio)}`)];
}

function parsedMask(words: readonly string[]): ObjectPixelMask | null {
	const limit = optionalNumber(words[0]);
	const source = words[1] === SVG_NONE ? undefined : parseFrame(words[1] ?? null);
	const points = words.slice(MASK_HEADER).map((word) => numberList(word));
	if (limit === null || source === null || !points.length || points.some((pair) => pair.length !== 2)) return null;
	return {
		points: points.map(([xRatio, yRatio]) => ({ xRatio: xRatio!, yRatio: yRatio! })),
		...(limit === undefined ? {} : { strokePointLimit: limit }),
		...(source ? { strokeSourceRect: source } : {}),
	};
}

/** The words of an erasure before its points, and of a cut before its outline. */
const ERASURE_HEADER = 4;
const MASK_HEADER = 2;

/** What erasing, cutting and keeping did to an item, which its drawing shows only as masks. */
export function erasableAttributes({ erasures, pixelCutouts, pixelClips }: Erasable): SvgAttributes {
	return {
		[SvgDataAttribute.Erasures]: erasures?.length ? entriesValue(erasures.map(erasureEntry)) : undefined,
		[SvgDataAttribute.Cutouts]: pixelCutouts?.length ? entriesValue(pixelCutouts.map(maskEntry)) : undefined,
		[SvgDataAttribute.Clips]: pixelClips?.length ? entriesValue(pixelClips.map(maskEntry)) : undefined,
	};
}

/** What erasing, cutting and keeping did to an item, from its group; null when any of it cannot be read. */
export function readErasable(group: Element): Erasable | null {
	const erasures = parseEntries(group.getAttribute(SvgDataAttribute.Erasures)).map(parsedErasure);
	const cutouts = parseEntries(group.getAttribute(SvgDataAttribute.Cutouts)).map(parsedMask);
	const clips = parseEntries(group.getAttribute(SvgDataAttribute.Clips)).map(parsedMask);
	if (erasures.includes(null) || cutouts.includes(null) || clips.includes(null)) return null;
	return {
		...(erasures.length ? { erasures: erasures as ObjectErasurePath[] } : {}),
		...(cutouts.length ? { pixelCutouts: cutouts as ObjectPixelMask[] } : {}),
		...(clips.length ? { pixelClips: clips as ObjectPixelMask[] } : {}),
	};
}

/** The codec for an item's own type. */
export function itemCodec<Item extends AnnotationObject>(item: Item): SvgItemCodec<Item> {
	return SVG_ITEM_CODECS[item.type] as unknown as SvgItemCodec<Item>;
}

export function isAnnotationObjectType(value: string | null): value is AnnotationObjectType {
	return Object.values(AnnotationObjectTypeId).some((type) => type === value);
}
