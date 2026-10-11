/**
 * What a line ends in, at either end. Hollow ends are only outlined, so the
 * line stops at their back instead of running through them.
 */
export const LineEnd = {
	None: 'none',
	Arrow: 'arrow',
	OpenArrow: 'openArrow',
	Triangle: 'triangle',
	Diamond: 'diamond',
	FilledDiamond: 'filledDiamond',
	Circle: 'circle',
	Cross: 'cross',
} as const;
export type LineEnd = (typeof LineEnd)[keyof typeof LineEnd];

export function isLineEnd(value: unknown): value is LineEnd {
	return Object.values(LineEnd).some((end) => end === value);
}

/** A line's two ends: `head` at its last point, `tail` at its first. */
export type LineEnds = Readonly<{ head: LineEnd; tail: LineEnd }>;

/** A plain arrow: an arrowhead at the last point only. */
export const ARROW_ENDS: LineEnds = { head: LineEnd.Arrow, tail: LineEnd.None };

/** How each end is named where people choose one. */
export const LINE_END_LABELS: Readonly<Record<LineEnd, string>> = {
	[LineEnd.None]: 'None',
	[LineEnd.Arrow]: 'Arrow',
	[LineEnd.OpenArrow]: 'Open arrow',
	[LineEnd.Triangle]: 'Hollow triangle',
	[LineEnd.Diamond]: 'Hollow diamond',
	[LineEnd.FilledDiamond]: 'Filled diamond',
	[LineEnd.Circle]: 'Circle',
	[LineEnd.Cross]: 'Cross',
};
