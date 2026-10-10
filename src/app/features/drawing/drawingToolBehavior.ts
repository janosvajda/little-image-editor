import {
	MarkupToolId,
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
	type MarkupTool,
	type Tool,
	type PaintTool,
	type ShapeTool,
} from '../../core/document/appTypes';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';
import { SelectionPresentation } from '../annotations/selectionOverlayRenderer';

export const DrawingToolKind = {
	Paint: 'paint',
	Shape: 'shape',
	Markup: 'markup',
	Select: 'select',
	Picker: 'picker',
	Crop: 'crop',
	Zoom: 'zoom',
	Fill: 'fill',
} as const;
export type DrawingToolKind =
	(typeof DrawingToolKind)[keyof typeof DrawingToolKind];

export const ToolOptionSource = {
	Contextual: 'contextual',
	Tool: 'tool',
} as const;
export type ToolOptionSource =
	(typeof ToolOptionSource)[keyof typeof ToolOptionSource];

export const ToolSizeLabel = {
	PaintWidth: 'Width',
	EraserWidth: 'Eraser width',
	ShapeStrokeWidth: 'Stroke width',
	MarkerSize: 'Marker size',
	TextSize: 'Text size',
	BlurStrength: 'Blur strength',
} as const;
export type ToolSizeLabel = (typeof ToolSizeLabel)[keyof typeof ToolSizeLabel];

/** Whether a tool's colour follows the colour shared by drawing tools or is its own. */
export const ToolColorScope = {
	Shared: 'shared',
	Own: 'own',
} as const;
export type ToolColorScope =
	(typeof ToolColorScope)[keyof typeof ToolColorScope];

/** The tool whose profile keeps the shared drawing colour. */
const SHARED_COLOR_OWNER: Tool = PaintToolId.Brush;
/** An eyedropper drawn for the colour picker; its tip, at the given point, samples the colour. */
const PICKER_CURSOR = 'url("assets/cursors/pickerCursor.svg") 3 28, crosshair';

export interface DrawingToolOptions {
	readonly color: boolean;
	readonly size: boolean;
	readonly opacity: boolean;
	readonly hardness: boolean;
	readonly shapeFill: boolean;
	readonly fill: boolean;
	readonly picker: boolean;
	readonly crop: boolean;
	readonly zoom: boolean;
	/** The next number a numbered marker gets, with a reset. */
	readonly marker: boolean;
}

export interface DrawingToolBehavior {
	readonly kind: DrawingToolKind;
	readonly cursor: string;
	readonly options: DrawingToolOptions;
	readonly optionSource: ToolOptionSource;
	readonly sizeLabel?: ToolSizeLabel;
	/** Defaults to the shared colour, so a picked colour stays picked across tools. */
	readonly colorScope?: ToolColorScope;
}

const NO_OPTIONS: DrawingToolOptions = {
	color: false,
	size: false,
	opacity: false,
	hardness: false,
	shapeFill: false,
	fill: false,
	picker: false,
	crop: false,
	zoom: false,
	marker: false,
};
const PAINT_OPTIONS: DrawingToolOptions = {
	...NO_OPTIONS,
	color: true,
	size: true,
	opacity: true,
	hardness: true,
};
const SHAPE_OPTIONS: DrawingToolOptions = {
	...NO_OPTIONS,
	color: true,
	size: true,
	opacity: true,
	shapeFill: true,
};

const paint = (
	options = PAINT_OPTIONS,
	cursor = 'crosshair',
): DrawingToolBehavior => ({
	kind: DrawingToolKind.Paint,
	cursor,
	options,
	optionSource: ToolOptionSource.Contextual,
	sizeLabel: ToolSizeLabel.PaintWidth,
});
const shape = (): DrawingToolBehavior => ({
	kind: DrawingToolKind.Shape,
	cursor: 'crosshair',
	options: SHAPE_OPTIONS,
	optionSource: ToolOptionSource.Contextual,
	sizeLabel: ToolSizeLabel.ShapeStrokeWidth,
});

type MarkupBehaviorDetails = Partial<
	Pick<DrawingToolBehavior, 'cursor' | 'sizeLabel' | 'colorScope'>
>;

const markup = (
	options: Partial<DrawingToolOptions>,
	{ cursor = 'crosshair', ...details }: MarkupBehaviorDetails = {},
): DrawingToolBehavior => ({
	kind: DrawingToolKind.Markup,
	cursor,
	options: { ...NO_OPTIONS, ...options },
	optionSource: ToolOptionSource.Contextual,
	...details,
});

export const DRAWING_TOOL_BEHAVIORS: Readonly<
	Record<Tool, DrawingToolBehavior>
> = {
	[PaintToolId.Pencil]: paint(),
	[PaintToolId.Brush]: paint(),
	[PaintToolId.Marker]: paint(),
	[PaintToolId.Highlighter]: paint(),
	[PaintToolId.Calligraphy]: paint(),
	[PaintToolId.Spray]: paint(),
	[PaintToolId.Eraser]: {
		...paint({ ...PAINT_OPTIONS, color: false }, 'cell'),
		optionSource: ToolOptionSource.Tool,
		sizeLabel: ToolSizeLabel.EraserWidth,
	},
	[ShapeToolId.Line]: shape(),
	[ShapeToolId.Arrow]: shape(),
	[ShapeToolId.Rectangle]: shape(),
	[ShapeToolId.RoundedRectangle]: shape(),
	[ShapeToolId.Ellipse]: shape(),
	[ShapeToolId.Triangle]: shape(),
	[ShapeToolId.Diamond]: shape(),
	[ShapeToolId.Star]: shape(),
	[MarkupToolId.Number]: markup(
		{ color: true, size: true, marker: true },
		{ sizeLabel: ToolSizeLabel.MarkerSize, colorScope: ToolColorScope.Own },
	),
	[MarkupToolId.Highlight]: markup({ color: true, opacity: true }),
	[MarkupToolId.Text]: markup(
		{ color: true, size: true },
		{ sizeLabel: ToolSizeLabel.TextSize, cursor: 'text' },
	),
	[MarkupToolId.Blur]: markup(
		{ size: true },
		{ sizeLabel: ToolSizeLabel.BlurStrength },
	),
	[MarkupToolId.Redact]: markup({}),
	[UtilityToolId.Select]: {
		kind: DrawingToolKind.Select,
		cursor: 'default',
		options: NO_OPTIONS,
		optionSource: ToolOptionSource.Contextual,
	},
	[UtilityToolId.Picker]: {
		kind: DrawingToolKind.Picker,
		cursor: PICKER_CURSOR,
		options: { ...NO_OPTIONS, picker: true },
		optionSource: ToolOptionSource.Contextual,
	},
	[UtilityToolId.Crop]: {
		kind: DrawingToolKind.Crop,
		cursor: 'crosshair',
		options: { ...NO_OPTIONS, crop: true },
		optionSource: ToolOptionSource.Tool,
	},
	[UtilityToolId.Zoom]: {
		kind: DrawingToolKind.Zoom,
		cursor: 'zoom-in',
		options: { ...NO_OPTIONS, zoom: true },
		optionSource: ToolOptionSource.Contextual,
	},
	[UtilityToolId.Fill]: {
		kind: DrawingToolKind.Fill,
		cursor: '',
		options: { ...NO_OPTIONS, opacity: true, fill: true },
		optionSource: ToolOptionSource.Contextual,
	},
};

export function drawingToolBehavior(tool: Tool): DrawingToolBehavior {
	return DRAWING_TOOL_BEHAVIORS[tool];
}

export function isToolKind(tool: Tool, kind: DrawingToolKind): boolean {
	return drawingToolBehavior(tool).kind === kind;
}

/** The tool whose profile remembers this tool's colour. */
export function colorProfileOwner(tool: Tool): Tool {
	return drawingToolBehavior(tool).colorScope === ToolColorScope.Own
		? tool
		: SHARED_COLOR_OWNER;
}

/** The tool whose colour an item's colour edit updates; markup tool ids are their item types. */
export function colorProfileOwnerOfItem(type: AnnotationObject['type']): Tool {
	const markupTool = Object.values(MarkupToolId).find((tool) => tool === type);
	return markupTool ? colorProfileOwner(markupTool) : SHARED_COLOR_OWNER;
}

export function isPaintTool(tool: Tool): tool is PaintTool {
	return isToolKind(tool, DrawingToolKind.Paint);
}
export function isShapeTool(tool: Tool): tool is ShapeTool {
	return isToolKind(tool, DrawingToolKind.Shape);
}
export function isMarkupTool(tool: Tool): tool is MarkupTool {
	return isToolKind(tool, DrawingToolKind.Markup);
}

/**
 * Select and shape tools show transform controls; Crop outlines the cut piece
 * it moves, and Fill outlines the selection it is limited to.
 */
export function selectionPresentationFor(tool: Tool): SelectionPresentation {
	if (tool === UtilityToolId.Select || isShapeTool(tool))
		return SelectionPresentation.Transform;
	if (tool === UtilityToolId.Crop || tool === UtilityToolId.Fill)
		return SelectionPresentation.Frame;
	return SelectionPresentation.Hidden;
}

/** Whether a tool edits a layer of this type in place, without switching to Select. */
export function toolEditsLayer(
	tool: Tool,
	type: AnnotationObject['type'],
): boolean {
	if (tool === UtilityToolId.Select || tool === PaintToolId.Eraser) return true;
	if (isShapeTool(tool)) return type === AnnotationObjectTypeId.Shape;
	return isPaintTool(tool) && type === AnnotationObjectTypeId.Stroke;
}
