import type { LineEnd } from '../annotations/lineEnd';
import type { Gradient } from '../../core/geometry/gradient';
import { type CropRect, type Point, type ShapeTool, ShapeToolId } from '../../core/document/appTypes';
import { ColorPalette } from '../../core/document/colorPalette';

/**
 * Edits an assistant can ask the editor for. They run through the same
 * layer and item model as the tools, so each one is a single undo step and
 * saves with the document, in its SVG.
 *
 * This file has no browser dependencies: the VS Code extension, which runs
 * in Node, shares it with the editor.
 */
export const AssistantCommandKind = {
	Describe: 'describe',
	AddLayer: 'addLayer',
	AddShape: 'addShape',
	AddLine: 'addLine',
	AddText: 'addText',
	/** A vector path from SVG path data. */
	AddPath: 'addPath',
	/** A picture file placed on the image as a pixel item. */
	PlaceImage: 'placeImage',
	/** The visible image as an SVG document. */
	ExportSvg: 'exportSvg',
	RemoveItem: 'removeItem',
	Undo: 'undo',
	/** Several drawing commands as one undo step; nothing changes if one fails. */
	Batch: 'batch',
} as const;
export type AssistantCommandKind =
	(typeof AssistantCommandKind)[keyof typeof AssistantCommandKind];

/** A new image's size and background. */
export interface NewImageSpec {
	readonly width: number;
	readonly height: number;
	/** A CSS hex colour; ignored when the background is transparent. */
	readonly background: string;
	readonly transparent: boolean;
}

/** Shapes drawn inside a rectangle; lines and arrows are drawn between two points instead. */
export type BoxShape = Exclude<ShapeTool, typeof ShapeToolId.Line | typeof ShapeToolId.Arrow>;

export function isBoxShape(shape: ShapeTool): shape is BoxShape {
	return shape !== ShapeToolId.Line && shape !== ShapeToolId.Arrow;
}

/** Every box shape, for choosing one. */
export const BOX_SHAPES = Object.values(ShapeToolId).filter(isBoxShape) as [BoxShape, ...BoxShape[]];

/** What a drawing command uses when it leaves a style out: in the draw script and in an assistant's single tools. */
export const DrawingDefault = {
	Background: ColorPalette.White,
	StrokeWidth: 4,
	Opacity: 1,
	FontSize: 32,
	Rotation: 0,
} as const;

/**
 * Ids are shown to assistants by their first characters, which is plenty to
 * tell an image's items apart; any unique start of an id is accepted back.
 */
export const SHORT_ID_LENGTH = 8;

export function shortId(id: string): string {
	return id.slice(0, SHORT_ID_LENGTH);
}

/** Where an item goes: a layer by id or name; without one, the active layer, or a new layer above the image. */
interface LayerTarget {
	readonly layer?: string;
}

export type AssistantCommand =
	| DrawingCommand
	| Readonly<{ kind: typeof AssistantCommandKind.Describe }>
	| Readonly<{ kind: typeof AssistantCommandKind.RemoveItem; item: string }>
	| Readonly<{ kind: typeof AssistantCommandKind.Undo }>
	| Readonly<{ kind: typeof AssistantCommandKind.ExportSvg }>
	| Readonly<{ kind: typeof AssistantCommandKind.Batch; commands: readonly DrawingCommand[] }>
	| PlaceImageCommand;

/** Commands carried out at once, without waiting on the browser. */
export type ImmediateCommand = Exclude<AssistantCommand, PlaceImageCommand>;

/** A picture placed on the image; decoding it waits on the browser, so it runs on its own, not in a batch. */
export type PlaceImageCommand = LayerTarget &
	Readonly<{
		kind: typeof AssistantCommandKind.PlaceImage;
		/** The picture's file name, whose extension says its format. */
		fileName: string;
		/** The file's bytes, in base64. */
		contents: string;
		/** Its top left corner; centred when left out. */
		at?: Point;
		/** Its size; fitted inside the image when left out, its height following its width when only that is given. */
		width?: number;
		height?: number;
	}>;

/** The commands that add to an image, which a batch is made of. */
export type DrawingCommand =
	| Readonly<{ kind: typeof AssistantCommandKind.AddLayer; name?: string }>
	| (LayerTarget &
			Readonly<{
				kind: typeof AssistantCommandKind.AddShape;
				shape: BoxShape;
				rect: CropRect;
				color: string;
				/** Filled with the colour, or with `fillColor` under an outline in the colour; otherwise only outlined. */
				fill: boolean;
				/** A filled shape's own fill colour. */
				fillColor?: string;
				/** A gradient a filled shape is filled with instead. */
				fillGradient?: Gradient;
				/** Outline width in pixels. */
				strokeWidth: number;
				/** From 0 to 1. */
				opacity: number;
				/** Degrees, clockwise, around the shape's centre. */
				rotation: number;
			}>)
	| (LayerTarget &
			Readonly<{
				kind: typeof AssistantCommandKind.AddLine;
				from: Point;
				/** Bends between the ends, in order; a line with bends is one connector item. */
				via?: readonly Point[];
				to: Point;
				/** Draws an arrowhead at `to`. */
				arrow: boolean;
				color: string;
				width: number;
				opacity: number;
				/** Drawn in dashes; a dashed line is a connector item too. */
				dashed?: boolean;
				/** The end at `to` when it is not the plain arrowhead; any named end makes a connector item. */
				head?: LineEnd;
				/** The end at `from`. */
				tail?: LineEnd;
			}>)
	| (LayerTarget &
			Readonly<{
				kind: typeof AssistantCommandKind.AddText;
				/** The left end of the text's baseline: the letters sit on this point's y. */
				at: Point;
				text: string;
				color: string;
				/** Font size in pixels. */
				size: number;
			}>)
	| (LayerTarget &
			Readonly<{
				kind: typeof AssistantCommandKind.AddPath;
				/** SVG path data, such as "M10 10 C 40 0 60 0 90 10 Z". */
				d: string;
				color: string;
				width: number;
				opacity: number;
				/** A filled path is filled with `fillColor` under its line, or with its colour alone. */
				fill?: boolean;
				fillColor?: string;
				fillGradient?: Gradient;
				dashed?: boolean;
				head?: LineEnd;
				tail?: LineEnd;
			}>);

export interface DescribedItem {
	readonly id: string;
	readonly type: string;
	/** The shape drawn, for shape items. */
	readonly shape?: string;
	readonly text?: string;
	readonly color?: string;
	readonly bounds?: CropRect;
}

export interface DescribedLayer {
	readonly id: string;
	readonly name: string;
	readonly visible: boolean;
	readonly locked: boolean;
	readonly active: boolean;
	/** Bottom first, as they are drawn. */
	readonly items: readonly DescribedItem[];
}

/** The open image and its layers, bottom first; the image itself is below them all. */
export interface DocumentDescription {
	readonly name: string;
	readonly width: number;
	readonly height: number;
	readonly layers: readonly DescribedLayer[];
}

export type AssistantResult =
	| Readonly<{ document: DocumentDescription }>
	| Readonly<{ layerId: string; layerName: string }>
	| Readonly<{ itemId: string; layerId: string; layerName: string }>
	| Readonly<{ removed: string }>
	| Readonly<{ undone: boolean }>
	| Readonly<{ svg: { readonly markup: string; readonly width: number; readonly height: number } }>
	| Readonly<{ batch: { readonly layers: readonly string[]; readonly items: number } }>;
