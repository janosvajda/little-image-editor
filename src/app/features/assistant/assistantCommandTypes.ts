import type { CropRect, Point, ShapeTool } from '../../core/document/appTypes';

/**
 * Edits an assistant can ask the editor for. They run through the same
 * layer and item model as the tools, so each one is a single undo step and
 * saves with the document, `.limg` projects included.
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
	RemoveItem: 'removeItem',
	Undo: 'undo',
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
export type BoxShape = Exclude<ShapeTool, 'line' | 'arrow'>;

/** Where an item goes: a layer by id or name; without one, the active layer, or a new layer above the image. */
interface LayerTarget {
	readonly layer?: string;
}

export type AssistantCommand =
	| Readonly<{ kind: typeof AssistantCommandKind.Describe }>
	| Readonly<{ kind: typeof AssistantCommandKind.AddLayer; name?: string }>
	| (LayerTarget &
			Readonly<{
				kind: typeof AssistantCommandKind.AddShape;
				shape: BoxShape;
				rect: CropRect;
				color: string;
				/** Filled with the colour; otherwise only outlined. */
				fill: boolean;
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
				to: Point;
				/** Draws an arrowhead at `to`. */
				arrow: boolean;
				color: string;
				width: number;
				opacity: number;
			}>)
	| (LayerTarget &
			Readonly<{
				kind: typeof AssistantCommandKind.AddText;
				/** The text's top left corner. */
				at: Point;
				text: string;
				color: string;
				/** Font size in pixels. */
				size: number;
			}>)
	| Readonly<{ kind: typeof AssistantCommandKind.RemoveItem; item: string }>
	| Readonly<{ kind: typeof AssistantCommandKind.Undo }>;

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
	| Readonly<{ undone: boolean }>;
