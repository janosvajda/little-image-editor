import {
	PaintToolId,
	ShapeToolId,
	UtilityToolId,
	type Tool,
} from '../../core/document/appTypes';

export const DrawingToolKind = {
	Paint: 'paint',
	Shape: 'shape',
	Select: 'select',
	Picker: 'picker',
	Crop: 'crop',
	Zoom: 'zoom',
	Fill: 'fill',
} as const;
export type DrawingToolKind =
	(typeof DrawingToolKind)[keyof typeof DrawingToolKind];

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
}

export interface DrawingToolBehavior {
	readonly kind: DrawingToolKind;
	readonly cursor: string;
	readonly options: DrawingToolOptions;
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
): DrawingToolBehavior => ({ kind: DrawingToolKind.Paint, cursor, options });
const shape = (): DrawingToolBehavior => ({
	kind: DrawingToolKind.Shape,
	cursor: 'crosshair',
	options: SHAPE_OPTIONS,
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
	[PaintToolId.Eraser]: paint({ ...PAINT_OPTIONS, color: false }, 'cell'),
	[ShapeToolId.Line]: shape(),
	[ShapeToolId.Arrow]: shape(),
	[ShapeToolId.Rectangle]: shape(),
	[ShapeToolId.RoundedRectangle]: shape(),
	[ShapeToolId.Ellipse]: shape(),
	[ShapeToolId.Triangle]: shape(),
	[ShapeToolId.Diamond]: shape(),
	[ShapeToolId.Star]: shape(),
	[UtilityToolId.Select]: {
		kind: DrawingToolKind.Select,
		cursor: 'default',
		options: NO_OPTIONS,
	},
	[UtilityToolId.Picker]: {
		kind: DrawingToolKind.Picker,
		cursor: 'copy',
		options: { ...NO_OPTIONS, picker: true },
	},
	[UtilityToolId.Crop]: {
		kind: DrawingToolKind.Crop,
		cursor: 'crosshair',
		options: { ...NO_OPTIONS, crop: true },
	},
	[UtilityToolId.Zoom]: {
		kind: DrawingToolKind.Zoom,
		cursor: 'zoom-in',
		options: { ...NO_OPTIONS, zoom: true },
	},
	[UtilityToolId.Fill]: {
		kind: DrawingToolKind.Fill,
		cursor: '',
		options: { ...NO_OPTIONS, opacity: true, fill: true },
	},
};

export function drawingToolBehavior(tool: Tool): DrawingToolBehavior {
	return DRAWING_TOOL_BEHAVIORS[tool];
}

export function isToolKind(tool: Tool, kind: DrawingToolKind): boolean {
	return drawingToolBehavior(tool).kind === kind;
}
