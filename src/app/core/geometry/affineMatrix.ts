import type { Point } from '../document/appTypes';

/**
 * 2D affine transforms, as canvas and SVG both write them: `[a, b, c, d, e, f]`
 * maps a point to `(a·x + c·y + e, b·x + d·y + f)`. Shared by SVG export,
 * which records the canvas's transforms, and SVG import, which reads an SVG's.
 */

export type AffineMatrix = readonly [number, number, number, number, number, number];

export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0];

const DEGREES_PER_HALF_TURN = 180;
/** Differences below this are rounding, not a skew or an uneven scale. */
const TOLERANCE = 1e-6;

export function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
}

export function radiansToDegrees(radians: number): number {
	return (radians * DEGREES_PER_HALF_TURN) / Math.PI;
}

export function translation(x: number, y = 0): AffineMatrix {
	return [1, 0, 0, 1, x, y];
}

export function scaling(x: number, y = x): AffineMatrix {
	return [x, 0, 0, y, 0, 0];
}

export function rotation(radians: number): AffineMatrix {
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	return [cosine, sine, -sine, cosine, 0, 0];
}

/** A turn about a centre. */
export function rotationAbout(radians: number, { x, y }: Point): AffineMatrix {
	return multiplyMatrices(translation(x, y), multiplyMatrices(rotation(radians), translation(-x, -y)));
}

/** `outer · inner`: the transform that applies `inner` first, then `outer`. */
export function multiplyMatrices(outer: AffineMatrix, inner: AffineMatrix): AffineMatrix {
	const [a, b, c, d, e, f] = outer;
	const [na, nb, nc, nd, ne, nf] = inner;
	return [a * na + c * nb, b * na + d * nb, a * nc + c * nd, b * nc + d * nd, a * ne + c * nf + e, b * ne + d * nf + f];
}

export function transformPoint([a, b, c, d, e, f]: AffineMatrix, { x, y }: Point): Point {
	return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function isIdentityMatrix(matrix: AffineMatrix): boolean {
	return matrix.every((value, index) => value === IDENTITY_MATRIX[index]);
}

/** How much a transform scales lengths on average: the square root of how much it scales areas. */
export function averageScale([a, b, c, d]: AffineMatrix): number {
	return Math.sqrt(Math.abs(a * d - b * c));
}

/** A transform taken apart as a turn after a scale along each axis, and whether it also skews. */
export interface MatrixParts {
	/** Degrees, clockwise on screen. */
	readonly rotation: number;
	readonly scaleX: number;
	/** Negative when the transform mirrors. */
	readonly scaleY: number;
	readonly skewed: boolean;
}

export function matrixParts([a, b, c, d]: AffineMatrix): MatrixParts {
	const scaleX = Math.hypot(a, b);
	const determinant = a * d - b * c;
	const scaleY = scaleX ? determinant / scaleX : 0;
	// The columns of a turn after a scale stay at right angles; a skew leans one towards the other.
	const skewed = scaleX === 0 || Math.abs(a * c + b * d) > TOLERANCE * Math.max(1, scaleX * Math.abs(scaleY));
	return { rotation: radiansToDegrees(Math.atan2(b, a)), scaleX, scaleY, skewed };
}

/** An SVG transform list's function names, as written in files. */
const TransformFunction = {
	Matrix: 'matrix',
	Translate: 'translate',
	Scale: 'scale',
	Rotate: 'rotate',
	SkewX: 'skewX',
	SkewY: 'skewY',
} as const;
type TransformFunction = (typeof TransformFunction)[keyof typeof TransformFunction];

const TRANSFORM_PART = /\s*([a-zA-Z]+)\s*\(([^)]*)\)\s*,?/y;
const NUMBER_LIST = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
const MATRIX_VALUES = 6;

/** The matrix one transform function stands for; none when its name or values are not ones SVG allows. */
const TRANSFORM_FUNCTIONS: Readonly<Record<TransformFunction, (values: readonly number[]) => AffineMatrix | null>> = {
	[TransformFunction.Matrix]: (values) => (values.length === MATRIX_VALUES ? (values as unknown as AffineMatrix) : null),
	[TransformFunction.Translate]: ([x, y = 0, ...rest]) => (x === undefined || rest.length ? null : translation(x, y)),
	[TransformFunction.Scale]: ([x, y, ...rest]) => (x === undefined || rest.length ? null : scaling(x, y ?? x)),
	[TransformFunction.Rotate]: ([angle, cx, cy, ...rest]) => {
		if (angle === undefined || rest.length || (cx === undefined) !== (cy === undefined)) return null;
		const turn = rotation(degreesToRadians(angle));
		return cx === undefined || cy === undefined ? turn : multiplyMatrices(translation(cx, cy), multiplyMatrices(turn, translation(-cx, -cy)));
	},
	[TransformFunction.SkewX]: ([angle, ...rest]) => (angle === undefined || rest.length ? null : [1, 0, Math.tan(degreesToRadians(angle)), 1, 0, 0]),
	[TransformFunction.SkewY]: ([angle, ...rest]) => (angle === undefined || rest.length ? null : [1, Math.tan(degreesToRadians(angle)), 0, 1, 0, 0]),
};

function isTransformFunction(name: string): name is TransformFunction {
	return Object.values<string>(TransformFunction).includes(name);
}

/** An SVG `transform` attribute as one matrix; none when it cannot be read, so a caller can treat it as unsupported. */
export function parseTransform(text: string | null): AffineMatrix | null {
	if (!text?.trim()) return IDENTITY_MATRIX;
	let matrix = IDENTITY_MATRIX;
	TRANSFORM_PART.lastIndex = 0;
	let match: RegExpExecArray | null;
	while (TRANSFORM_PART.lastIndex < text.length && (match = TRANSFORM_PART.exec(text))) {
		const [, name = '', values = ''] = match;
		if (!isTransformFunction(name)) return null;
		const part = TRANSFORM_FUNCTIONS[name]((values.match(NUMBER_LIST) ?? []).map(Number));
		if (!part) return null;
		matrix = multiplyMatrices(matrix, part);
	}
	return text.slice(TRANSFORM_PART.lastIndex).trim() ? null : matrix;
}
