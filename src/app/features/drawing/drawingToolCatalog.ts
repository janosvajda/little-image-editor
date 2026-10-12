import { EditorIconId, editorIconMarkup } from '../../shared/style/editorIcons';
import {
	type ConnectorTool,
	ConnectorToolId,
	type PathTool,
	PathToolId,
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
import { ToolbarId } from '../workspace/toolbarTypes';

export interface ToolDefinition<TTool extends string = string> {
	id: TTool;
	label: string;
	icon: string;
	title: string;
	shortcut?: string;
	/** Other toolbar views that present this shared tool. The Tools toolbar contains all tools. */
	readonly additionalToolbars?: readonly ToolbarId[];
}

export const PAINT_TOOL_DEFINITIONS = [
	{
		id: PaintToolId.Pencil,
		label: 'Pencil',
		icon: editorIconMarkup(EditorIconId.Pencil),
		title: 'Pencil (P)',
		shortcut: 'p',
	},
	{
		id: PaintToolId.Brush,
		label: 'Brush',
		icon: editorIconMarkup(EditorIconId.Brush),
		title: 'Brush (B)',
		shortcut: 'b',
	},
	{
		id: PaintToolId.Marker,
		label: 'Marker',
		icon: editorIconMarkup(EditorIconId.Marker),
		title: 'Marker (M)',
		shortcut: 'm',
	},
	{
		id: PaintToolId.Highlighter,
		label: 'Highlighter',
		icon: editorIconMarkup(EditorIconId.Highlighter),
		title: 'Highlighter (H)',
		shortcut: 'h',
	},
	{
		id: PaintToolId.Calligraphy,
		label: 'Calligraphy ink',
		icon: editorIconMarkup(EditorIconId.Calligraphy),
		title: 'Calligraphy brush (A)',
		shortcut: 'a',
	},
	{
		id: PaintToolId.Spray,
		label: 'Spray paint',
		icon: editorIconMarkup(EditorIconId.Spray),
		title: 'Spray paint (S)',
		shortcut: 's',
	},
	{
		id: PaintToolId.Eraser,
		label: 'Eraser',
		icon: editorIconMarkup(EditorIconId.Eraser),
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
		icon: editorIconMarkup(EditorIconId.Line),
		title: 'Line (L)',
		shortcut: 'l',
	},
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: ShapeToolId.Arrow,
		label: 'Arrow',
		icon: editorIconMarkup(EditorIconId.Arrow),
		title: 'Arrow',
	},
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: ShapeToolId.Rectangle,
		label: 'Rectangle',
		icon: editorIconMarkup(EditorIconId.Rectangle),
		title: 'Rectangle (R)',
		shortcut: 'r',
	},
	{
		id: ShapeToolId.RoundedRectangle,
		label: 'Rounded rectangle',
		icon: editorIconMarkup(EditorIconId.RoundedRectangle),
		title: 'Rounded rectangle',
	},
	{
		id: ShapeToolId.Ellipse,
		label: 'Ellipse',
		icon: editorIconMarkup(EditorIconId.Ellipse),
		title: 'Ellipse (O)',
		shortcut: 'o',
	},
	{ id: ShapeToolId.Triangle, label: 'Triangle', icon: editorIconMarkup(EditorIconId.Triangle), title: 'Triangle' },
	{ id: ShapeToolId.Diamond, label: 'Diamond', icon: editorIconMarkup(EditorIconId.Diamond), title: 'Diamond' },
	{ id: ShapeToolId.Star, label: 'Star', icon: editorIconMarkup(EditorIconId.Star), title: 'Star' },
] as const satisfies readonly ToolDefinition<ShapeTool>[];

/** Shown with the shapes, but they draw one connector item with right-angled bends. */
export const CONNECTOR_TOOL_DEFINITIONS = [
	{
		id: ConnectorToolId.ElbowArrow,
		label: 'Elbow arrow',
		icon: editorIconMarkup(EditorIconId.ElbowArrow),
		title: 'Elbow arrow (K)',
		shortcut: 'k',
	},
] as const satisfies readonly ToolDefinition<ConnectorTool>[];

/** Shown with the shapes, but they draw one vector path of lines and curves. */
export const PATH_TOOL_DEFINITIONS = [
	{
		id: PathToolId.Pen,
		label: 'Pen',
		icon: editorIconMarkup(EditorIconId.Pen),
		title: 'Pen (Y): click for corners, drag for curves, Enter to finish',
		shortcut: 'y',
	},
	{
		id: PathToolId.Polyline,
		label: 'Polyline',
		icon: editorIconMarkup(EditorIconId.Polyline),
		title: 'Polyline (J): click for each corner, click the first to close, Enter to finish',
		shortcut: 'j',
	},
] as const satisfies readonly ToolDefinition<PathTool>[];

/** The Shape tools menu: shapes, then connectors, then the pen. */
export const SHAPE_MENU_TOOL_DEFINITIONS: readonly ToolDefinition<ShapeTool | ConnectorTool | PathTool>[] = [
	...SHAPE_TOOL_DEFINITIONS,
	...CONNECTOR_TOOL_DEFINITIONS,
	...PATH_TOOL_DEFINITIONS,
];

export const MARKUP_TOOL_DEFINITIONS = [
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: MarkupToolId.Number,
		label: 'Number',
		icon: editorIconMarkup(EditorIconId.Number),
		title: 'Numbered marker (N)',
		shortcut: 'n',
	},
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: MarkupToolId.Highlight,
		label: 'Highlight',
		icon: editorIconMarkup(EditorIconId.Highlight),
		title: 'Highlight area (G)',
		shortcut: 'g',
	},
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: MarkupToolId.Text,
		label: 'Text',
		icon: editorIconMarkup(EditorIconId.Text),
		title: 'Text (T)',
		shortcut: 't',
	},
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: MarkupToolId.Blur,
		label: 'Blur',
		icon: editorIconMarkup(EditorIconId.Blur),
		title: 'Blur area (U)',
		shortcut: 'u',
	},
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: MarkupToolId.Redact,
		label: 'Redact',
		icon: editorIconMarkup(EditorIconId.Redact),
		title: 'Redact area (X)',
		shortcut: 'x',
	},
] as const satisfies readonly ToolDefinition<MarkupTool>[];

export const UTILITY_TOOL_DEFINITIONS = [
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: UtilityToolId.Select,
		label: 'Select',
		icon: editorIconMarkup(EditorIconId.Select),
		title: 'Select and transform shapes (V)',
		shortcut: 'v',
	},
	{
		id: UtilityToolId.Picker,
		label: 'Picker',
		icon: editorIconMarkup(EditorIconId.Picker),
		title: 'Color picker (I): click for the line colour, Alt/Option-click for the fill colour',
		shortcut: 'i',
	},
	{
		additionalToolbars: [ToolbarId.Annotations],
		id: UtilityToolId.Crop,
		label: 'Crop',
		icon: editorIconMarkup(EditorIconId.Crop),
		title: 'Crop (C)',
		shortcut: 'c',
	},
	{
		id: UtilityToolId.Zoom,
		label: 'Zoom',
		icon: editorIconMarkup(EditorIconId.Zoom),
		title: 'Zoom (Z); Alt/Option-click to zoom out',
		shortcut: 'z',
	},
	{
		id: UtilityToolId.Fill,
		label: 'Fill',
		icon: editorIconMarkup(EditorIconId.Fill),
		title: 'Fill contiguous area (F)',
		shortcut: 'f',
	},
] as const satisfies readonly ToolDefinition<UtilityTool>[];

export const DRAWING_TOOL_DEFINITIONS: readonly ToolDefinition<Tool>[] = [
	...PAINT_TOOL_DEFINITIONS,
	...SHAPE_TOOL_DEFINITIONS,
	...CONNECTOR_TOOL_DEFINITIONS,
	...PATH_TOOL_DEFINITIONS,
	...MARKUP_TOOL_DEFINITIONS,
	...UTILITY_TOOL_DEFINITIONS,
];

export function toolsForToolbar(
	toolbar: ToolbarId,
): readonly ToolDefinition<Tool>[] {
	return DRAWING_TOOL_DEFINITIONS.filter(
		(tool) =>
			toolbar === ToolbarId.Tools || tool.additionalToolbars?.includes(toolbar),
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
