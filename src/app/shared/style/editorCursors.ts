import {
	MarkupToolId,
	PaintToolId,
	PathToolId,
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';

const CursorId = {
	Pencil: 'pencil',
	Brush: 'brush',
	Marker: 'marker',
	Highlighter: 'highlighter',
	Pen: 'penCursor',
	Eraser: 'eraser',
	Fill: 'fillCursor',
	Picker: 'pickerCursor',
	Crosshair: 'crosshair',
	Text: 'text',
	Move: 'move',
	Grab: 'grab',
	ZoomIn: 'zoom-in',
	ZoomOut: 'zoom-out',
	ResizeHorizontal: 'resize-horizontal',
	ResizeVertical: 'resize-vertical',
	ResizeDiagonal: 'resize-diagonal',
	ResizeDiagonalReverse: 'resize-diagonal-reverse',
	Rotate: 'rotate',
	Lasso: 'lasso',
} as const;
type CursorId = (typeof CursorId)[keyof typeof CursorId];
export const EditorCursorVariant = { Lasso: 'lasso' } as const;
export type EditorCursorVariant =
	(typeof EditorCursorVariant)[keyof typeof EditorCursorVariant];
const CENTER: Point = { x: 16, y: 16 };
const HOTSPOTS: Readonly<Record<CursorId, Point>> = {
	[CursorId.Pencil]: { x: 3, y: 29 },
	[CursorId.Brush]: { x: 3, y: 18 },
	[CursorId.Marker]: { x: 3, y: 29 },
	[CursorId.Highlighter]: { x: 3, y: 26 },
	[CursorId.Pen]: { x: 4, y: 4 },
	[CursorId.Eraser]: { x: 4, y: 20 },
	[CursorId.Fill]: { x: 26, y: 26 },
	[CursorId.Picker]: { x: 3, y: 28 },
	[CursorId.Crosshair]: CENTER,
	[CursorId.Text]: CENTER,
	[CursorId.Move]: CENTER,
	[CursorId.Grab]: CENTER,
	[CursorId.ZoomIn]: { x: 15, y: 15 },
	[CursorId.ZoomOut]: { x: 15, y: 15 },
	[CursorId.ResizeHorizontal]: CENTER,
	[CursorId.ResizeVertical]: CENTER,
	[CursorId.ResizeDiagonal]: CENTER,
	[CursorId.ResizeDiagonalReverse]: CENTER,
	[CursorId.Rotate]: { x: 12, y: 12 },
	[CursorId.Lasso]: { x: 26, y: 26 },
};
const TOOL_ARTWORK: Readonly<Partial<Record<Tool, CursorId>>> = {
	[PaintToolId.Pencil]: CursorId.Pencil,
	[PaintToolId.Brush]: CursorId.Brush,
	[PaintToolId.Marker]: CursorId.Marker,
	[PaintToolId.Highlighter]: CursorId.Highlighter,
	[PaintToolId.Calligraphy]: CursorId.Pen,
	[PaintToolId.Eraser]: CursorId.Eraser,
	[PathToolId.Pen]: CursorId.Pen,
	[UtilityToolId.Fill]: CursorId.Fill,
	[UtilityToolId.Picker]: CursorId.Picker,
	[MarkupToolId.Text]: CursorId.Text,
};
const STATE_ARTWORK: Readonly<Record<string, CursorId | undefined>> = {
	move: CursorId.Move,
	grab: CursorId.Grab,
	grabbing: CursorId.Grab,
	'zoom-in': CursorId.ZoomIn,
	'zoom-out': CursorId.ZoomOut,
	'ew-resize': CursorId.ResizeHorizontal,
	'ns-resize': CursorId.ResizeVertical,
	'nwse-resize': CursorId.ResizeDiagonal,
	'nesw-resize': CursorId.ResizeDiagonalReverse,
};
const CURSOR_PROPERTY = '--editor-cursor';
const SVG_DATA_CURSOR_PREFIX = 'url("data:image/svg+xml';

/** Changes artwork only: retain the router's state and every existing event coordinate. */
export function presentEditorCursor(
	element: HTMLElement,
	tool: Tool,
	state: string,
	variant?: EditorCursorVariant,
): void {
	element.style.cursor = state;
	const rotating = state.startsWith(SVG_DATA_CURSOR_PREFIX);
	const artwork = rotating
		? CursorId.Rotate
		: (STATE_ARTWORK[state] ?? toolArtwork(tool, state, variant));
	if (!artwork) {
		element.style.setProperty(CURSOR_PROPERTY, state);
		return;
	}
	const { x, y } = HOTSPOTS[artwork];
	const fallback = rotating
		? 'alias'
		: state.startsWith('url(')
			? 'crosshair'
			: state;
	element.style.setProperty(
		CURSOR_PROPERTY,
		`url("assets/cursors/${artwork}.svg") ${x} ${y}, ${fallback}`,
	);
}

function toolArtwork(
	tool: Tool,
	state: string,
	variant?: EditorCursorVariant,
): CursorId | undefined {
	if (
		state !== 'crosshair' &&
		state !== 'cell' &&
		state !== 'text' &&
		!state.startsWith('url(')
	)
		return undefined;
	if (tool === UtilityToolId.Crop && variant === EditorCursorVariant.Lasso)
		return CursorId.Lasso;
	return TOOL_ARTWORK[tool] ?? CursorId.Crosshair;
}
