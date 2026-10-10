import {
	MarkupToolId,
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
	type MarkupTool,
	type PaintTool,
	type ShapeTool,
	type Tool,
	type UtilityTool,
} from '../../core/document/appTypes';

export interface ToolDefinition<TTool extends string = string> {
	id: TTool;
	label: string;
	icon: string;
	title: string;
	shortcut?: string;
}

export const PAINT_TOOL_DEFINITIONS = [
	{
		id: PaintToolId.Pencil,
		label: 'Pencil',
		icon: '✎',
		title: 'Pencil (P)',
		shortcut: 'p',
	},
	{
		id: PaintToolId.Brush,
		label: 'Brush',
		icon: '●',
		title: 'Brush (B)',
		shortcut: 'b',
	},
	{
		id: PaintToolId.Marker,
		label: 'Marker',
		icon: '▰',
		title: 'Marker (M)',
		shortcut: 'm',
	},
	{
		id: PaintToolId.Highlighter,
		label: 'Highlighter',
		icon: '▬',
		title: 'Highlighter (H)',
		shortcut: 'h',
	},
	{
		id: PaintToolId.Calligraphy,
		label: 'Calligraphy ink',
		icon: '◒',
		title: 'Calligraphy brush (A)',
		shortcut: 'a',
	},
	{
		id: PaintToolId.Spray,
		label: 'Spray paint',
		icon: '⁙',
		title: 'Spray paint (S)',
		shortcut: 's',
	},
	{
		id: PaintToolId.Eraser,
		label: 'Eraser',
		icon: '<svg class="eraser-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 15.5 14 5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-9 9H8a2 2 0 0 1-1.4-.6l-3.1-3.1a.6.6 0 0 1 0-.8Z"></path><path d="m8 11 5 5M12 7l5 5M11 20h10"></path></svg>',
		title: 'Eraser (E)',
		shortcut: 'e',
	},
] as const satisfies readonly ToolDefinition<PaintTool>[];

export const BRUSH_TOOL_DEFINITIONS = PAINT_TOOL_DEFINITIONS.filter(
	(tool) => tool.id !== PaintToolId.Eraser,
);
export const ERASER_TOOL_DEFINITION = PAINT_TOOL_DEFINITIONS.find(
	(tool) => tool.id === PaintToolId.Eraser,
)!;

export const SHAPE_TOOL_DEFINITIONS = [
	{
		id: ShapeToolId.Line,
		label: 'Line',
		icon: '╱',
		title: 'Line (L)',
		shortcut: 'l',
	},
	{ id: ShapeToolId.Arrow, label: 'Arrow', icon: '↗', title: 'Arrow' },
	{
		id: ShapeToolId.Rectangle,
		label: 'Rectangle',
		icon: '□',
		title: 'Rectangle (R)',
		shortcut: 'r',
	},
	{
		id: ShapeToolId.RoundedRectangle,
		label: 'Rounded rectangle',
		icon: '▢',
		title: 'Rounded rectangle',
	},
	{
		id: ShapeToolId.Ellipse,
		label: 'Ellipse',
		icon: '○',
		title: 'Ellipse (O)',
		shortcut: 'o',
	},
	{ id: ShapeToolId.Triangle, label: 'Triangle', icon: '△', title: 'Triangle' },
	{ id: ShapeToolId.Diamond, label: 'Diamond', icon: '◇', title: 'Diamond' },
	{ id: ShapeToolId.Star, label: 'Star', icon: '☆', title: 'Star' },
] as const satisfies readonly ToolDefinition<ShapeTool>[];

export const MARKUP_TOOL_DEFINITIONS = [
	{
		id: MarkupToolId.Number,
		label: 'Number',
		icon: '①',
		title: 'Numbered marker (N)',
		shortcut: 'n',
	},
	{
		id: MarkupToolId.Highlight,
		label: 'Highlight',
		icon: '▰',
		title: 'Highlight area (G)',
		shortcut: 'g',
	},
	{ id: MarkupToolId.Text, label: 'Text', icon: 'T', title: 'Text (T)', shortcut: 't' },
	{ id: MarkupToolId.Blur, label: 'Blur', icon: '▦', title: 'Blur area (U)', shortcut: 'u' },
	{
		id: MarkupToolId.Redact,
		label: 'Redact',
		icon: '■',
		title: 'Redact area (X)',
		shortcut: 'x',
	},
] as const satisfies readonly ToolDefinition<MarkupTool>[];

export const UTILITY_TOOL_DEFINITIONS = [
	{
		id: UtilityToolId.Select,
		label: 'Select',
		icon: '↖',
		title: 'Select and transform shapes (V)',
		shortcut: 'v',
	},
	{
		id: UtilityToolId.Picker,
		label: 'Picker',
		icon: '<svg class="eyedropper-icon" viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(38 12 12)"><path class="eyedropper-bulb" d="M9 5a3 3 0 0 1 6 0v3H9Z"></path><path class="eyedropper-collar" d="M7.5 7.5h9v3h-9Z"></path><path class="eyedropper-glass" d="M9.5 10.5h5v6.25L13 20h-2l-1.5-3.25Z"></path><path class="eyedropper-liquid" d="M11 12h2v4.4l-1 2.1-1-2.1Z"></path></g></svg>',
		title: 'Color picker (I)',
		shortcut: 'i',
	},
	{
		id: UtilityToolId.Crop,
		label: 'Crop',
		icon: '⌗',
		title: 'Crop (C)',
		shortcut: 'c',
	},
	{
		id: UtilityToolId.Zoom,
		label: 'Zoom',
		icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"></circle><path d="m15 15 5 5M7 10h6M10 7v6"></path></svg>',
		title: 'Zoom (Z); Alt/Option-click to zoom out',
		shortcut: 'z',
	},
	{
		id: UtilityToolId.Fill,
		label: 'Fill',
		icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 11 7-7 7 7-7 7zM8 8l8 8M18 17c0 2 1 3 2 3s2-1 2-3c0-1-2-3-2-3s-2 2-2 3Z"></path></svg>',
		title: 'Fill contiguous area (F)',
		shortcut: 'f',
	},
] as const satisfies readonly ToolDefinition<UtilityTool>[];

export const DRAWING_TOOL_DEFINITIONS: readonly ToolDefinition<Tool>[] = [
	...PAINT_TOOL_DEFINITIONS,
	...SHAPE_TOOL_DEFINITIONS,
	...MARKUP_TOOL_DEFINITIONS,
	...UTILITY_TOOL_DEFINITIONS,
];

export const PAINT_TOOLS = new Set<Tool>(
	PAINT_TOOL_DEFINITIONS.map((tool) => tool.id),
);
export const SHAPE_TOOLS = new Set<Tool>(
	SHAPE_TOOL_DEFINITIONS.map((tool) => tool.id),
);

export function isDrawingTool(value: string | null): value is Tool {
	return (
		value !== null && DRAWING_TOOL_DEFINITIONS.some((tool) => tool.id === value)
	);
}

const TOOLS_BY_SHORTCUT = new Map(
	DRAWING_TOOL_DEFINITIONS.flatMap((tool) =>
		tool.shortcut ? [[tool.shortcut, tool.id] as const] : [],
	),
);
export function toolForShortcut(key: string): Tool | undefined {
	return TOOLS_BY_SHORTCUT.get(key.toLowerCase());
}
