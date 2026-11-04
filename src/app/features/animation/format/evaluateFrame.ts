import { type AffineMatrix, IDENTITY_MATRIX, multiplyMatrices, rotation, scaling, translation } from '../../../core/geometry/affineMatrix';
import type { BlendMode } from '../../../core/layers/layerTypes';
import { Numeric } from '../../../shared/math/numericConstants';
import { lerp, lerpRgba } from '../colorInterpolation';
import { easeProgress } from '../easing';
import { tweenProgress, turnDelta } from '../motionTween';
import { roundFileNumber } from './animationFileFormat';
import {
	type AnimationFile,
	type AnimItem,
	AnimItemKind,
	type AnimLayer,
	type Contour,
	type FileFillRule,
	type FileStroke,
	type FileTimeline,
	type FileTween,
	type FontSpec,
	type FrameSize,
	type Paint,
	PaintKind,
	type PathCommand,
	PathCommandName,
	PlayMode,
	type Rgba,
	type SymbolDef,
	type TextAlign,
	type TextBaseline,
	type Tint,
	type Transform,
} from './animationSchema';

/**
 * The reference player: what an animation file draws at a frame, as a flat
 * list of primitives per layer, each with its final matrix, opacity and
 * paints. It is a pure function of the file and the frame, and the golden
 * fixtures check it, so every player can check itself against the same
 * results. `docs/animation-format.md` describes each step.
 */

export const DrawKind = { Path: 'path', Text: 'text', Image: 'image' } as const;

interface DrawBase {
	/** Maps the primitive's own coordinates onto the stage: `[a, b, c, d, e, f]`, as canvas and SVG write it. */
	readonly matrix: AffineMatrix;
	readonly opacity: number;
}

export interface DrawPath extends DrawBase {
	readonly kind: typeof DrawKind.Path;
	readonly contours: Contour[];
	readonly fill: Paint | null;
	readonly fillRule: FileFillRule;
	readonly stroke: FileStroke | null;
}

export interface DrawText extends DrawBase {
	readonly kind: typeof DrawKind.Text;
	readonly text: string;
	readonly font: FontSpec;
	readonly color: Rgba;
	readonly align: TextAlign;
	readonly baseline: TextBaseline;
	readonly maxWidth?: number;
}

export interface DrawImage extends DrawBase {
	readonly kind: typeof DrawKind.Image;
	readonly width: number;
	readonly height: number;
	readonly png: string;
	/** Tints to apply to the picture's colours, innermost instance first. */
	readonly tints: Tint[];
}

export type DrawPrimitive = DrawPath | DrawText | DrawImage;

/** One visible layer, composited as one group over the layers beneath it. */
export interface DrawLayer {
	readonly id: string;
	readonly blendMode: BlendMode;
	readonly opacity: number;
	readonly items: DrawPrimitive[];
}

export interface DrawList {
	readonly frame: number;
	readonly width: number;
	readonly height: number;
	readonly background: Rgba | null;
	/** Bottom layer first. */
	readonly layers: DrawLayer[];
}

/** An item as a keyframe holds it at a frame, and the frame its keyframe starts at, which instances count time from. */
interface PosedItem {
	readonly item: AnimItem;
	readonly keyframeStart: number;
}

/** What drawing passes down from an item to what it holds. */
interface DrawContext {
	readonly symbols: ReadonlyMap<string, SymbolDef>;
	readonly matrix: AffineMatrix;
	readonly opacity: number;
	/** Tints, outermost instance first. */
	readonly tints: readonly Tint[];
	/** The frame of the timeline the item is on. */
	readonly frame: number;
	readonly keyframeStart: number;
}

const FULL_TURN_RADIANS = Math.PI * Numeric.HalfDivisor;

/** What the file draws at `frame`, counted from 0 on its main timeline. */
export function evaluateFrame(file: AnimationFile, frame: number): DrawList {
	const symbols = new Map(file.library.map((symbol) => [symbol.id, symbol]));
	return {
		frame,
		width: file.stage.width,
		height: file.stage.height,
		background: file.stage.background,
		layers: file.timeline.layers
			.filter((layer) => layer.visible)
			.map((layer) => ({
				id: layer.id,
				blendMode: layer.blendMode,
				opacity: layer.opacity,
				items: drawLayerItems(layer, frame, { symbols, matrix: IDENTITY_MATRIX, opacity: 1, tints: [], frame, keyframeStart: 0 }),
			})),
	};
}

/** The items a layer shows at a frame: its active keyframe's, tweened towards the next keyframe inside a motion tween. */
export function layerItemsAt(layer: AnimLayer, frame: number): PosedItem[] {
	if (frame < 0 || frame >= layer.length) return [];
	let index = layer.keyframes.length - 1;
	while (index >= 0 && layer.keyframes[index]!.frame > frame) index--;
	const keyframe = layer.keyframes[index];
	if (!keyframe) return [];
	const next = layer.keyframes[index + 1];
	const pose = (item: AnimItem): PosedItem => ({ item, keyframeStart: keyframe.frame });
	if (!keyframe.tween || !next || frame === keyframe.frame) return keyframe.items.map(pose);
	const progress = easeProgress(keyframe.tween.ease, tweenProgress(frame, keyframe.frame, next.frame));
	const targets = new Map(next.items.map((item) => [item.id, item]));
	const tween = keyframe.tween;
	return keyframe.items.map((item) => {
		const target = targets.get(item.id);
		return pose(target && target.kind === item.kind ? tweenItem(item, target, tween, progress) : item);
	});
}

/** The frame of a symbol an instance shows, `elapsed` frames after the keyframe that placed it. */
export function instanceFrame(play: PlayMode, firstFrame: number, elapsed: number, frames: number): number {
	switch (play) {
		case PlayMode.Single:
			return firstFrame;
		case PlayMode.Loop:
			return (((firstFrame + elapsed) % frames) + frames) % frames;
		case PlayMode.Once:
			return Math.min(firstFrame + elapsed, frames - 1);
	}
}

/** The local-to-parent matrix of a transform: `translate(x, y) · rotate · skewX · scale · translate(−pivot)`. */
export function transformMatrix({ x, y, rotation: angle, scaleX, scaleY, skewX, pivot }: Transform): AffineMatrix {
	return [translation(x, y), rotation(angle), skewing(skewX), scaling(scaleX, scaleY), translation(-pivot.x, -pivot.y)].reduce(multiplyMatrices);
}

function skewing(angle: number): AffineMatrix {
	return [1, 0, Math.tan(angle), 1, 0, 0];
}

function drawLayerItems(layer: AnimLayer, frame: number, context: DrawContext): DrawPrimitive[] {
	return layerItemsAt(layer, frame).flatMap(({ item, keyframeStart }) => drawItem(item, { ...context, frame, keyframeStart }));
}

function drawItem(item: AnimItem, context: DrawContext): DrawPrimitive[] {
	if (!item.visible) return [];
	const matrix = rounded(multiplyMatrices(context.matrix, transformMatrix(item.transform)));
	const opacity = roundFileNumber(context.opacity * item.opacity);
	switch (item.kind) {
		case AnimItemKind.Path:
			return [
				{
					kind: DrawKind.Path,
					matrix,
					opacity,
					contours: item.contours,
					fill: item.fill && tintedPaint(item.fill, context.tints),
					fillRule: item.fillRule,
					stroke: item.stroke && { ...item.stroke, paint: tintedPaint(item.stroke.paint, context.tints) },
				},
			];
		case AnimItemKind.Text:
			return [
				{
					kind: DrawKind.Text,
					matrix,
					opacity,
					text: item.text,
					font: item.font,
					color: tintedColor(item.color, context.tints),
					align: item.align,
					baseline: item.baseline,
					...(item.maxWidth === undefined ? {} : { maxWidth: item.maxWidth }),
				},
			];
		case AnimItemKind.Image:
			return [{ kind: DrawKind.Image, matrix, opacity, width: item.width, height: item.height, png: item.png, tints: [...context.tints].reverse() }];
		case AnimItemKind.Group:
			return item.items.flatMap((child) => drawItem(child, { ...context, matrix, opacity }));
		case AnimItemKind.Instance: {
			const symbol = context.symbols.get(item.symbol);
			if (!symbol) return [];
			const symbolFrame = instanceFrame(item.play, item.firstFrame, context.frame - context.keyframeStart, symbol.frames);
			const tints = item.tint ? [...context.tints, item.tint] : context.tints;
			return drawTimeline(symbol.timeline, symbolFrame, { ...context, matrix, opacity, tints });
		}
	}
}

/** A symbol's timeline at a frame, its layers drawn bottom first into the instance; their opacity multiplies in. */
function drawTimeline(timeline: FileTimeline, frame: number, context: DrawContext): DrawPrimitive[] {
	return timeline.layers.filter((layer) => layer.visible).flatMap((layer) => drawLayerItems(layer, frame, { ...context, opacity: context.opacity * layer.opacity }));
}

// Tweening

/**
 * An item between its keyframe and the next, at eased progress `t`: its
 * transform, opacity, frame and paints change; its content is the first
 * keyframe's, laid out in the changing frame.
 */
export function tweenItem(from: AnimItem, to: AnimItem, tween: FileTween, t: number): AnimItem {
	const frame = from.frame && to.frame ? lerpFrame(from.frame, to.frame, t) : from.frame;
	const transform = tweenTransform(from.transform, to.transform, tween, t, from.frame, to.frame, frame);
	const tweened = { ...withPaints(from, to, t), transform, opacity: lerp(from.opacity, to.opacity, t) };
	if (!from.frame || !frame) return tweened;
	return { ...scaledContent(tweened, ratio(frame.width, from.frame.width), ratio(frame.height, from.frame.height)), frame };
}

function tweenTransform(from: Transform, to: Transform, tween: FileTween, t: number, fromFrame?: FrameSize, toFrame?: FrameSize, frame?: FrameSize): Transform {
	return {
		x: lerp(from.x, to.x, t),
		y: lerp(from.y, to.y, t),
		rotation: from.rotation + turnDelta(from.rotation, to.rotation, tween.rotate, tween.extraTurns, FULL_TURN_RADIANS) * t,
		scaleX: lerp(from.scaleX, to.scaleX, t),
		scaleY: lerp(from.scaleY, to.scaleY, t),
		skewX: lerp(from.skewX, to.skewX, t),
		pivot: fromFrame && toFrame && frame ? relativePivot(from.pivot, to.pivot, fromFrame, toFrame, frame, t) : { x: lerp(from.pivot.x, to.pivot.x, t), y: lerp(from.pivot.y, to.pivot.y, t) },
	};
}

/** A pivot kept relative to a changing frame: its share of the frame is what changes evenly. */
function relativePivot(from: Transform['pivot'], to: Transform['pivot'], fromFrame: FrameSize, toFrame: FrameSize, frame: FrameSize, t: number): Transform['pivot'] {
	const along = (start: number, end: number, startSize: number, endSize: number, size: number) =>
		startSize && endSize ? lerp(start / startSize, end / endSize, t) * size : lerp(start, end, t);
	return { x: along(from.x, to.x, fromFrame.width, toFrame.width, frame.width), y: along(from.y, to.y, fromFrame.height, toFrame.height, frame.height) };
}

function lerpFrame(from: FrameSize, to: FrameSize, t: number): FrameSize {
	return { width: lerp(from.width, to.width, t), height: lerp(from.height, to.height, t) };
}

/** The paints of `from` changed towards those of `to`, where the two pair up; content stays `from`'s. */
function withPaints(from: AnimItem, to: AnimItem, t: number): AnimItem {
	if (from.kind === AnimItemKind.Path && to.kind === AnimItemKind.Path)
		return {
			...from,
			fill: from.fill && to.fill ? lerpPaint(from.fill, to.fill, t) : from.fill,
			stroke: from.stroke && to.stroke ? { ...from.stroke, paint: lerpPaint(from.stroke.paint, to.stroke.paint, t) } : from.stroke,
		};
	if (from.kind === AnimItemKind.Text && to.kind === AnimItemKind.Text) return { ...from, color: lerpRgba(from.color, to.color, t) as Rgba };
	if (from.kind === AnimItemKind.Group && to.kind === AnimItemKind.Group && sameShape(from.items, to.items))
		return { ...from, items: from.items.map((child, index) => withPaints(child, to.items[index]!, t)) };
	if (from.kind === AnimItemKind.Instance && to.kind === AnimItemKind.Instance && from.tint && to.tint)
		return { ...from, tint: { color: lerpRgba(from.tint.color, to.tint.color, t) as Rgba, amount: lerp(from.tint.amount, to.tint.amount, t) } };
	return from;
}

function sameShape(from: readonly AnimItem[], to: readonly AnimItem[]): boolean {
	return from.length === to.length && from.every((child, index) => child.kind === to[index]!.kind);
}

/** Solid colours change channel by channel; gradients of one kind with as many stops change stop by stop; others hold. */
export function lerpPaint(from: Paint, to: Paint, t: number): Paint {
	if (from.kind === PaintKind.Solid && to.kind === PaintKind.Solid) return { kind: PaintKind.Solid, color: lerpRgba(from.color, to.color, t) as Rgba };
	if (from.kind === PaintKind.Solid || to.kind === PaintKind.Solid || from.kind !== to.kind || from.stops.length !== to.stops.length) return from;
	return {
		kind: from.kind,
		stops: from.stops.map((stop, index) => ({ offset: lerp(stop.offset, to.stops[index]!.offset, t), color: lerpRgba(stop.color, to.stops[index]!.color, t) as Rgba })),
		from: { x: lerp(from.from.x, to.from.x, t), y: lerp(from.from.y, to.from.y, t) },
		to: { x: lerp(from.to.x, to.to.x, t), y: lerp(from.to.y, to.to.y, t) },
	};
}

/**
 * Content laid out in a frame scaled by (sx, sy): path coordinates, picture
 * sizes and children's positions scale; line widths and dashes do not, and
 * text grows with the frame's height, as the editor lays content out.
 */
export function scaledContent(item: AnimItem, sx: number, sy: number): AnimItem {
	switch (item.kind) {
		case AnimItemKind.Path:
			return { ...item, contours: item.contours.map((contour) => ({ ...contour, commands: contour.commands.map((command) => scaledCommand(command, sx, sy)) })) };
		case AnimItemKind.Text:
			return { ...item, font: { ...item.font, size: item.font.size * sy }, ...(item.maxWidth === undefined ? {} : { maxWidth: item.maxWidth * sx }) };
		case AnimItemKind.Image:
			return { ...item, width: item.width * sx, height: item.height * sy };
		case AnimItemKind.Group:
			return { ...item, items: item.items.map((child) => scaledContent({ ...child, transform: { ...child.transform, x: child.transform.x * sx, y: child.transform.y * sy } }, sx, sy)) };
		case AnimItemKind.Instance:
			return item;
	}
}

function scaledCommand(command: PathCommand, sx: number, sy: number): PathCommand {
	switch (command[0]) {
		case PathCommandName.Move:
		case PathCommandName.Line:
			return [command[0], command[1] * sx, command[2] * sy];
		case PathCommandName.Cubic:
			return [command[0], command[1] * sx, command[2] * sy, command[3] * sx, command[4] * sy, command[5] * sx, command[6] * sy];
		case PathCommandName.Quadratic:
			return [command[0], command[1] * sx, command[2] * sy, command[3] * sx, command[4] * sy];
		case PathCommandName.Close:
			return command;
	}
}

function ratio(size: number, original: number): number {
	return original ? size / original : 1;
}

// Tints

/** A colour mixed towards each tint's colour by its amount, innermost instance first; alpha is kept. */
export function tintedColor(color: Rgba, tints: readonly Tint[]): Rgba {
	return [...tints].reverse().reduce<Rgba>((current, { color: tint, amount }) => [lerp(current[0], tint[0], amount), lerp(current[1], tint[1], amount), lerp(current[2], tint[2], amount), current[3]], color);
}

function tintedPaint(paint: Paint, tints: readonly Tint[]): Paint {
	if (!tints.length) return paint;
	if (paint.kind === PaintKind.Solid) return { ...paint, color: tintedColor(paint.color, tints) };
	return { ...paint, stops: paint.stops.map((stop) => ({ ...stop, color: tintedColor(stop.color, tints) })) };
}

function rounded(matrix: AffineMatrix): AffineMatrix {
	return matrix.map(roundFileNumber) as unknown as AffineMatrix;
}
