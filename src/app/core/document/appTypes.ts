export const PaintToolId = {
	Pencil: 'pencil',
	Brush: 'brush',
	Marker: 'marker',
	Highlighter: 'highlighter',
	Calligraphy: 'calligraphy',
	Spray: 'spray',
	Eraser: 'eraser',
} as const;
export type PaintTool = (typeof PaintToolId)[keyof typeof PaintToolId];

export const ShapeToolId = {
	Line: 'line',
	Arrow: 'arrow',
	Rectangle: 'rectangle',
	RoundedRectangle: 'roundedRectangle',
	Ellipse: 'ellipse',
	Triangle: 'triangle',
	Diamond: 'diamond',
	Star: 'star',
} as const;
export type ShapeTool = (typeof ShapeToolId)[keyof typeof ShapeToolId];

export const UtilityToolId = {
	Select: 'select',
	Picker: 'picker',
	Crop: 'crop',
	Zoom: 'zoom',
	Fill: 'fill',
} as const;
export type UtilityTool = (typeof UtilityToolId)[keyof typeof UtilityToolId];
export type Tool = PaintTool | ShapeTool | UtilityTool;
export const DEFAULT_DOCUMENT_NAME = 'untitled';
export type Point = Readonly<{ x: number; y: number }>;
export type CropRect = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;
export const ImageMimeType = {
	Png: 'image/png',
	Jpeg: 'image/jpeg',
	Webp: 'image/webp',
} as const;
export type ImageFormat = (typeof ImageMimeType)[keyof typeof ImageMimeType];

export const DocumentType = {
	Image: 'image',
	Project: 'project',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export interface NewImageOptions {
	name: string;
	width: number;
	height: number;
	transparent: boolean;
	background: string;
	format?: ImageFormat;
	resolution?: number;
	documentType?: DocumentType;
}

export interface ImageSnapshot {
	width: number;
	height: number;
	pixels: Uint8ClampedArray;
	baseName: string;
	savedType: ImageFormat;
	resolution?: number;
	documentType?: DocumentType;
}

export type HistorySnapshot = Pick<
	ImageSnapshot,
	'width' | 'height' | 'pixels'
>;

export interface DocumentSessionSnapshot extends ImageSnapshot {
	history: HistorySnapshot[];
	historyIndex: number;
	toolbarStates?: Record<string, unknown>;
	layerState?: LayerState;
}

import type { LayerState } from '../layers/layerTypes';
