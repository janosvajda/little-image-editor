import type { CropRect, Point } from '../document/appTypes';

export const TextShapeMetrics = {
	MinimumFontSize: 10,
	WidthPerCharacter: 0.62,
	LineHeight: 1.3,
	FontWeight: 600,
	FontFamily: 'system-ui,sans-serif',
} as const;

export function textFrame(at: Point, text: string, fontSize: number): CropRect {
	return {
		x: at.x,
		y: at.y - fontSize,
		width: Math.max(
			fontSize,
			text.length * fontSize * TextShapeMetrics.WidthPerCharacter,
		),
		height: fontSize * TextShapeMetrics.LineHeight,
	};
}

export function textFont(fontSize: number): string {
	return `${TextShapeMetrics.FontWeight} ${fontSize}px ${TextShapeMetrics.FontFamily}`;
}
