import { drawLineEnd } from '../annotations/arrowHead';
import { isLineEnd, LineEnd } from '../annotations/lineEnd';
import { asCanvasContext, SvgRecordingContext, svgElement } from './svgRecordingContext';

/**
 * Line ends as SVG markers. A marker is drawn by the editor's own line end
 * code, so it looks exactly as on the canvas, and names the end it is in a
 * `data-line-end` attribute, so an SVG opened again gets the same ends back.
 */

/** The attribute a marker names its line end in. */
export const LINE_END_ATTRIBUTE = 'data-line-end';

/** Where on a line an SVG marker goes: its start is an item's tail, its end its head. */
export const MarkerPosition = { Start: 'marker-start', End: 'marker-end' } as const;
export type MarkerPosition = (typeof MarkerPosition)[keyof typeof MarkerPosition];

const MARKER_SIZE = 1;

/** How a marker's end is drawn: its kind, the line's width and colour, its fading, and how far its tip reaches past where the line stops. */
export interface LineEndMarkerStyle {
	readonly end: LineEnd;
	readonly width: number;
	readonly color: string;
	readonly opacity: number;
	readonly inset: number;
}

/**
 * A marker for a line end, in the line's own units, turned with the line and
 * turned round at its start, so one marker serves either end.
 */
export function lineEndMarker(id: string, { end, width, color, opacity, inset }: LineEndMarkerStyle): string {
	const recorder = new SvgRecordingContext({ width: MARKER_SIZE, height: MARKER_SIZE }, `${id}-`);
	recorder.strokeStyle = color;
	recorder.fillStyle = color;
	recorder.lineWidth = width;
	recorder.lineCap = 'round';
	recorder.lineJoin = 'round';
	recorder.globalAlpha = opacity;
	// Drawn pointing right with its tip `inset` past the marker's point, where a trimmed line stops.
	drawLineEnd(asCanvasContext(recorder), { x: inset - 1, y: 0 }, { x: inset, y: 0 }, width, end);
	return svgElement(
		'marker',
		{
			id,
			[LINE_END_ATTRIBUTE]: end,
			markerUnits: 'userSpaceOnUse',
			orient: 'auto-start-reverse',
			overflow: 'visible',
			markerWidth: MARKER_SIZE,
			markerHeight: MARKER_SIZE,
			refX: 0,
			refY: 0,
		},
		`${recorder.definitions.join('')}${recorder.shapes.join('')}`,
	);
}

/** The line end a marker names; none for a marker of another kind, which only a picture of it can keep. */
export function markerLineEnd(marker: Element | null): LineEnd | null {
	const end = marker?.getAttribute(LINE_END_ATTRIBUTE);
	return isLineEnd(end) && end !== LineEnd.None ? end : null;
}
