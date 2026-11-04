import { z } from 'zod';
import { BlendMode } from '../../../core/layers/layerTypes';
import { AnimationDefaults, Ease, RotateDirection, TweenKind } from '../animationTypes';
import { ANIMATION_FORMAT_ID, ANIMATION_FORMAT_VERSION } from './animationFileFormat';

/**
 * The animation file's schema: the one definition of the format, used to
 * read files, to check what is written, and by the tests. Its types are the
 * file's types. `docs/animation-format.md` is its prose description.
 *
 * Objects take no fields they do not name: unknown fields are dropped when
 * read, so a newer minor writer's additions do not stop an older reader.
 */

/** Item kinds. */
export const AnimItemKind = { Path: 'path', Text: 'text', Image: 'image', Group: 'group', Instance: 'instance' } as const;
export type AnimItemKind = (typeof AnimItemKind)[keyof typeof AnimItemKind];

export const PaintKind = { Solid: 'solid', Linear: 'linear', Radial: 'radial' } as const;
export type PaintKind = (typeof PaintKind)[keyof typeof PaintKind];

export const PathCommandName = { Move: 'M', Line: 'L', Cubic: 'C', Quadratic: 'Q', Close: 'Z' } as const;
export type PathCommandName = (typeof PathCommandName)[keyof typeof PathCommandName];

export const FileFillRule = { NonZero: 'nonzero', EvenOdd: 'evenodd' } as const;
export type FileFillRule = (typeof FileFillRule)[keyof typeof FileFillRule];

export const LineCap = { Butt: 'butt', Round: 'round', Square: 'square' } as const;
export type LineCap = (typeof LineCap)[keyof typeof LineCap];

export const LineJoin = { Miter: 'miter', Round: 'round', Bevel: 'bevel' } as const;
export type LineJoin = (typeof LineJoin)[keyof typeof LineJoin];

export const TextAlign = { Left: 'left', Center: 'center', Right: 'right' } as const;
export type TextAlign = (typeof TextAlign)[keyof typeof TextAlign];

export const TextBaseline = { Alphabetic: 'alphabetic', Top: 'top', Middle: 'middle', Bottom: 'bottom' } as const;
export type TextBaseline = (typeof TextBaseline)[keyof typeof TextBaseline];

export const FontStyle = { Normal: 'normal', Italic: 'italic' } as const;
export type FontStyle = (typeof FontStyle)[keyof typeof FontStyle];

export const PlayMode = { Loop: 'loop', Once: 'once', Single: 'single' } as const;
export type PlayMode = (typeof PlayMode)[keyof typeof PlayMode];

/** The limits of a font's weight, as CSS gives them. */
export const FontWeightRange = { Minimum: 1, Maximum: 1000 } as const;

/** Number of control values in a custom ease. */
const CUBIC_BEZIER_VALUES = 4;

const unit = z.number().min(0).max(1);
const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const positive = finite.refine((value) => value > 0, 'must be greater than 0');
const frameNumber = z.number().int().min(AnimationDefaults.FirstFrame).max(AnimationDefaults.MaximumFrames - 1);
const frameCount = z.number().int().min(AnimationDefaults.MinimumLayerLength).max(AnimationDefaults.MaximumFrames);
const identifier = z.string().min(1);

export const rgbaSchema = z.tuple([unit, unit, unit, unit]);
export type Rgba = z.infer<typeof rgbaSchema>;

export const pointSchema = z.object({ x: finite, y: finite });
export type FilePoint = z.infer<typeof pointSchema>;

export const gradientStopSchema = z.object({ offset: unit, color: rgbaSchema });
export type FileGradientStop = z.infer<typeof gradientStopSchema>;

export const paintSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal(PaintKind.Solid), color: rgbaSchema }),
	z.object({ kind: z.enum([PaintKind.Linear, PaintKind.Radial]), stops: z.array(gradientStopSchema).min(2), from: pointSchema, to: pointSchema }),
]);
export type Paint = z.infer<typeof paintSchema>;

export const pathCommandSchema = z.union([
	z.tuple([z.literal(PathCommandName.Move), finite, finite]),
	z.tuple([z.literal(PathCommandName.Line), finite, finite]),
	z.tuple([z.literal(PathCommandName.Cubic), finite, finite, finite, finite, finite, finite]),
	z.tuple([z.literal(PathCommandName.Quadratic), finite, finite, finite, finite]),
	z.tuple([z.literal(PathCommandName.Close)]),
]);
export type PathCommand = z.infer<typeof pathCommandSchema>;

export const contourSchema = z.object({ closed: z.boolean(), commands: z.array(pathCommandSchema).min(1) });
export type Contour = z.infer<typeof contourSchema>;

export const strokeSchema = z.object({
	paint: paintSchema,
	width: positive,
	cap: z.enum(Object.values(LineCap) as [LineCap, ...LineCap[]]),
	join: z.enum(Object.values(LineJoin) as [LineJoin, ...LineJoin[]]),
	dash: z.array(z.number().min(0)),
});
export type FileStroke = z.infer<typeof strokeSchema>;

export const transformSchema = z.object({
	x: finite,
	y: finite,
	rotation: finite,
	scaleX: finite,
	scaleY: finite,
	skewX: finite,
	pivot: pointSchema,
});
export type Transform = z.infer<typeof transformSchema>;

export const fontSchema = z.object({
	family: z.string().min(1),
	size: positive,
	weight: z.number().int().min(FontWeightRange.Minimum).max(FontWeightRange.Maximum),
	style: z.enum(Object.values(FontStyle) as [FontStyle, ...FontStyle[]]),
});
export type FontSpec = z.infer<typeof fontSchema>;

export const frameSizeSchema = z.object({ width: z.number().min(0), height: z.number().min(0) });
export type FrameSize = z.infer<typeof frameSizeSchema>;

export const tintSchema = z.object({ color: rgbaSchema, amount: unit });
export type Tint = z.infer<typeof tintSchema>;

interface ItemBase {
	id: string;
	name?: string;
	transform: Transform;
	opacity: number;
	visible: boolean;
	/** The size of the item's own frame, which its content is laid out in; tweens change it. */
	frame?: FrameSize;
	/** The item as Little Image Editor edits it: opaque to players, who ignore it. */
	editor?: string;
}

export interface PathItem extends ItemBase {
	kind: typeof AnimItemKind.Path;
	contours: Contour[];
	fill: Paint | null;
	fillRule: FileFillRule;
	stroke: FileStroke | null;
}

export interface TextItem extends ItemBase {
	kind: typeof AnimItemKind.Text;
	text: string;
	font: FontSpec;
	color: Rgba;
	align: TextAlign;
	baseline: TextBaseline;
	/** The width the text is fitted into, its glyphs narrowed to fit when wider, as canvas `maxWidth` and SVG `textLength` do. */
	maxWidth?: number;
}

export interface ImageItem extends ItemBase {
	kind: typeof AnimItemKind.Image;
	width: number;
	height: number;
	/** The picture as base64 PNG, without a data URL prefix. */
	png: string;
}

export interface GroupItem extends ItemBase {
	kind: typeof AnimItemKind.Group;
	items: AnimItem[];
}

export interface InstanceItem extends ItemBase {
	kind: typeof AnimItemKind.Instance;
	symbol: string;
	play: PlayMode;
	firstFrame: number;
	tint: Tint | null;
}

export type AnimItem = PathItem | TextItem | ImageItem | GroupItem | InstanceItem;

const itemBase = {
	id: identifier,
	name: z.string().optional(),
	transform: transformSchema,
	opacity: unit,
	visible: z.boolean(),
	frame: frameSizeSchema.optional(),
	editor: z.string().optional(),
};

/** Base64 as PNG data holds it: letters, digits, `+`, `/` and padding. */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export const animItemSchema: z.ZodType<AnimItem> = z.lazy(() =>
	z.discriminatedUnion('kind', [
		z.object({ ...itemBase, kind: z.literal(AnimItemKind.Path), contours: z.array(contourSchema), fill: paintSchema.nullable(), fillRule: z.enum([FileFillRule.NonZero, FileFillRule.EvenOdd]), stroke: strokeSchema.nullable() }),
		z.object({
			...itemBase,
			kind: z.literal(AnimItemKind.Text),
			text: z.string(),
			font: fontSchema,
			color: rgbaSchema,
			align: z.enum(Object.values(TextAlign) as [TextAlign, ...TextAlign[]]),
			baseline: z.enum(Object.values(TextBaseline) as [TextBaseline, ...TextBaseline[]]),
			maxWidth: positive.optional(),
		}),
		z.object({ ...itemBase, kind: z.literal(AnimItemKind.Image), width: positive, height: positive, png: z.string().min(1).regex(BASE64) }),
		z.object({ ...itemBase, kind: z.literal(AnimItemKind.Group), items: z.array(animItemSchema) }),
		z.object({
			...itemBase,
			kind: z.literal(AnimItemKind.Instance),
			symbol: identifier,
			play: z.enum(Object.values(PlayMode) as [PlayMode, ...PlayMode[]]),
			firstFrame: frameNumber,
			tint: tintSchema.nullable(),
		}),
	]),
);

export const easeSpecSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.enum([Ease.Linear, Ease.EaseIn, Ease.EaseOut, Ease.EaseInOut]) }),
	z.object({
		kind: z.literal(Ease.Custom),
		points: z.tuple([unit, finite, unit, finite]).refine((points) => points.length === CUBIC_BEZIER_VALUES),
	}),
]);

export const motionTweenSchema = z.object({
	kind: z.literal(TweenKind.Motion),
	ease: easeSpecSchema,
	rotate: z.enum(Object.values(RotateDirection) as [RotateDirection, ...RotateDirection[]]),
	extraTurns: z.number().int().min(AnimationDefaults.MinimumExtraTurns),
});
export type FileTween = z.infer<typeof motionTweenSchema>;

export const keyframeSchema = z.object({ frame: frameNumber, items: z.array(animItemSchema), tween: motionTweenSchema.nullable() });
export type AnimKeyframe = z.infer<typeof keyframeSchema>;

export const layerSchema = z.object({
	id: identifier,
	name: z.string(),
	visible: z.boolean(),
	locked: z.boolean(),
	opacity: unit,
	blendMode: z.enum(Object.values(BlendMode) as [BlendMode, ...BlendMode[]]),
	/** How many frames the layer has; it shows nothing from this frame on. */
	length: frameCount,
	keyframes: z.array(keyframeSchema),
});
export type AnimLayer = z.infer<typeof layerSchema>;

export const frameLabelSchema = z.object({ name: z.string().min(1), frame: frameNumber, length: frameCount });
export type FrameLabel = z.infer<typeof frameLabelSchema>;

export const timelineSchema = z.object({ layers: z.array(layerSchema), labels: z.array(frameLabelSchema) });
export type FileTimeline = z.infer<typeof timelineSchema>;

export const symbolSchema = z.object({ id: identifier, name: z.string(), timeline: timelineSchema, frames: frameCount });
export type SymbolDef = z.infer<typeof symbolSchema>;

export const stageSchema = z.object({
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	background: rgbaSchema.nullable(),
	fps: z.number().int().min(AnimationDefaults.MinimumFps).max(AnimationDefaults.MaximumFps),
	frames: frameCount,
});
export type Stage = z.infer<typeof stageSchema>;

/** What makes a file invalid beyond the shape of its fields. */
export const AnimationFileIssue = {
	UnsortedKeyframes: 'Keyframes must be sorted by frame, each frame at most once.',
	KeyframePastLayer: 'A keyframe must lie within its layer’s length.',
	DuplicateLayerId: 'Layer ids must be unique within a timeline.',
	DuplicateItemId: 'Item ids must be unique within a keyframe.',
	DuplicateSymbolId: 'Symbol ids must be unique within the library.',
	MissingSymbol: 'An instance must name a symbol in the library.',
	SymbolCycle: 'A symbol must not contain itself, directly or through other symbols.',
	FirstFramePastSymbol: 'An instance’s first frame must lie within its symbol.',
} as const;

export const animationFileSchema = z
	.object({
		format: z.literal(ANIMATION_FORMAT_ID),
		version: z.literal(ANIMATION_FORMAT_VERSION),
		stage: stageSchema,
		library: z.array(symbolSchema),
		timeline: timelineSchema,
	})
	.superRefine((file, context) => {
		for (const issue of animationFileIssues(file)) context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
	});
export type AnimationFile = z.infer<typeof animationFileSchema>;

interface FileIssue {
	readonly message: string;
	readonly path: (string | number)[];
}

/** Every rule the shape of the fields cannot say, checked across the whole file. */
function animationFileIssues(file: Omit<AnimationFile, never>): FileIssue[] {
	const issues: FileIssue[] = [];
	const symbols = new Map(file.library.map((symbol) => [symbol.id, symbol]));
	if (symbols.size !== file.library.length) issues.push({ message: AnimationFileIssue.DuplicateSymbolId, path: ['library'] });
	issues.push(...timelineIssues(file.timeline, symbols, ['timeline']));
	file.library.forEach((symbol, index) => issues.push(...timelineIssues(symbol.timeline, symbols, ['library', index, 'timeline'])));
	for (const symbol of file.library) if (reachesSymbol(symbol.id, symbol.timeline, symbols, new Set())) issues.push({ message: AnimationFileIssue.SymbolCycle, path: ['library'] });
	return issues;
}

function timelineIssues(timeline: FileTimeline, symbols: ReadonlyMap<string, SymbolDef>, path: (string | number)[]): FileIssue[] {
	const issues: FileIssue[] = [];
	if (new Set(timeline.layers.map(({ id }) => id)).size !== timeline.layers.length) issues.push({ message: AnimationFileIssue.DuplicateLayerId, path: [...path, 'layers'] });
	timeline.layers.forEach((layer, layerIndex) =>
		layer.keyframes.forEach((_keyframe, index) => issues.push(...keyframeIssues(layer, index, symbols, [...path, 'layers', layerIndex, 'keyframes', index]))),
	);
	return issues;
}

/** A keyframe's place in its layer, its item ids, and the symbols its instances name. */
function keyframeIssues(layer: AnimLayer, index: number, symbols: ReadonlyMap<string, SymbolDef>, path: (string | number)[]): FileIssue[] {
	const keyframe = layer.keyframes[index]!;
	const issues: FileIssue[] = [];
	const previous = layer.keyframes[index - 1];
	if (previous && keyframe.frame <= previous.frame) issues.push({ message: AnimationFileIssue.UnsortedKeyframes, path });
	if (keyframe.frame >= layer.length) issues.push({ message: AnimationFileIssue.KeyframePastLayer, path });
	const itemsPath = [...path, 'items'];
	const ids = keyframe.items.map(({ id }) => id);
	if (new Set(ids).size !== ids.length) issues.push({ message: AnimationFileIssue.DuplicateItemId, path: itemsPath });
	for (const instance of instancesIn(keyframe.items)) {
		const symbol = symbols.get(instance.symbol);
		if (!symbol) issues.push({ message: AnimationFileIssue.MissingSymbol, path: itemsPath });
		else if (instance.firstFrame >= symbol.frames) issues.push({ message: AnimationFileIssue.FirstFramePastSymbol, path: itemsPath });
	}
	return issues;
}

/** Every instance among items, groups searched through. */
export function instancesIn(items: readonly AnimItem[]): InstanceItem[] {
	return items.flatMap((item) => {
		if (item.kind === AnimItemKind.Instance) return [item];
		return item.kind === AnimItemKind.Group ? instancesIn(item.items) : [];
	});
}

/** Whether a timeline places `target`, directly or through the symbols it places. */
function reachesSymbol(target: string, timeline: FileTimeline, symbols: ReadonlyMap<string, SymbolDef>, visited: Set<string>): boolean {
	return placedInstances(timeline).some((instance) => {
		if (instance.symbol === target) return true;
		const symbol = symbols.get(instance.symbol);
		if (!symbol || visited.has(symbol.id)) return false;
		visited.add(symbol.id);
		return reachesSymbol(target, symbol.timeline, symbols, visited);
	});
}

/** Every instance a timeline places, on any layer and keyframe. */
function placedInstances(timeline: FileTimeline): InstanceItem[] {
	return timeline.layers.flatMap((layer) => layer.keyframes.flatMap((keyframe) => instancesIn(keyframe.items)));
}
