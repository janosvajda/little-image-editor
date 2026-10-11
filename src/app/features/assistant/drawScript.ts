import { ShapeToolId } from '../../core/document/appTypes';
import { EditorLimit } from '../../core/document/editorLimits';
import { MAX_CANVAS_DIMENSION } from '../../core/geometry/geometryHelpers';
import {
	AssistantCommandKind,
	type BoxShape,
	type DrawingCommand,
	DrawingDefault,
	type NewImageSpec,
} from './assistantCommandTypes';
import { isLineEnd, LineEnd } from '../annotations/lineEnd';
import { parsePathData } from '../../core/geometry/vectorPath';
import { type Gradient, type GradientKind, gradientOf, MINIMUM_GRADIENT_STOPS } from '../../core/geometry/gradient';

/**
 * A compact drawing language, so an assistant draws a whole picture in one
 * request instead of one request per item. One statement per line:
 *
 *   image apple.png 512x512 #ffffff        (first line only: a new image; or "transparent")
 *   layer Apple                            (a new layer; what follows goes on it)
 *   use Circles                            (draw on an existing layer)
 *   circle 40,40 110 #3a86ff               (x,y of the top left corner, then the diameter)
 *   ellipse 150,215 125x195 #d62828 rotate 20 opacity 0.8
 *   rect 10,10 80x40 #222222 outline 3     (also roundrect, triangle, diamond, star; fill #ffffff fills under the outline;
 *                                           fill linear(90deg,#ffcc00,#ff6600) or fill radial(#ffffff,#000000) fills with a gradient)
 *   arrow 10,10 200,120 #000000 width 6    (also line; more points are bends; dashed draws dashes;
 *                                           head/tail triangle, diamond, filledDiamond, openArrow, circle, cross, none)
 *   text 20,60 #000000 size 48 "Hello"      (x,y: the left end of the baseline)
 *   path "M10 10 C 40 0 60 0 90 10 Z" #333333 width 2 fill #ffcc00   (SVG path data; head/tail and dashed as for lines)
 *   // a comment
 *
 * The whole script is checked before anything is drawn.
 */
export interface DrawScript {
	readonly image?: Readonly<{ name: string; spec: NewImageSpec }>;
	readonly commands: readonly DrawingCommand[];
	/** The script line each command came from, to point at a line when the editor refuses one. */
	readonly lines: readonly number[];
}

export class DrawScriptError extends Error {}

const Keyword = {
	Image: 'image',
	Layer: 'layer',
	Use: 'use',
	Circle: 'circle',
	Line: 'line',
	Arrow: 'arrow',
	Text: 'text',
	Path: 'path',
} as const;
const Option = {
	Outline: 'outline',
	Opacity: 'opacity',
	Rotate: 'rotate',
	Width: 'width',
	Size: 'size',
	Transparent: 'transparent',
	Dashed: 'dashed',
	Head: 'head',
	Tail: 'tail',
	Fill: 'fill',
} as const;
/** A gradient fill, written as in CSS: linear(90deg,#a,#b,…) with an optional angle first, or radial(#a,#b,…). */
const GRADIENT_FILL = /^(linear|radial)\(([^)]*)\)$/i;
const GRADIENT_ANGLE = /^(-?\d+(?:\.\d+)?)deg$/i;
/** Options that stand alone, without a number after them. */
const FLAG_OPTIONS: ReadonlySet<string> = new Set([Option.Dashed]);
/** Options followed by a word: the end a line has at its last or first point. */
const END_OPTIONS: ReadonlySet<string> = new Set([Option.Head, Option.Tail]);
const LINE_ENDS: readonly string[] = Object.values(LineEnd);
const FLAG_SET = 1;
const BOX_SHAPES: Readonly<Record<string, BoxShape>> = {
	rect: ShapeToolId.Rectangle,
	rectangle: ShapeToolId.Rectangle,
	roundrect: ShapeToolId.RoundedRectangle,
	ellipse: ShapeToolId.Ellipse,
	[Keyword.Circle]: ShapeToolId.Ellipse,
	triangle: ShapeToolId.Triangle,
	diamond: ShapeToolId.Diamond,
	star: ShapeToolId.Star,
};
const COMMENT = '//';
const COLOR = /^#[0-9a-fA-F]{6}$/;
const POINT = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
const SIZE = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/;
const QUOTE = '"';
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', '"': '"', '\\': '\\' };

export function parseDrawScript(source: string): DrawScript {
	const commands: DrawingCommand[] = [];
	const lines: number[] = [];
	let image: DrawScript['image'];
	let layer: string | undefined;
	source.split(/\r?\n/).forEach((text, index) => {
		const line = index + 1;
		const words = tokens(text.trim(), line);
		const [keyword, ...rest] = words;
		if (!keyword || keyword.startsWith(COMMENT)) return;
		const statement = new Statement(keyword.toLowerCase(), rest, line);
		switch (statement.keyword) {
			case Keyword.Image:
				if (image || commands.length) statement.fail('image can only be the first statement');
				image = statement.image();
				return;
			case Keyword.Layer:
				commands.push({ kind: AssistantCommandKind.AddLayer, name: statement.rest() });
				lines.push(line);
				layer = undefined;
				return;
			case Keyword.Use:
				layer = statement.rest();
				return;
			default:
				commands.push({ ...statement.item(), ...(layer ? { layer } : {}) });
				lines.push(line);
				if (commands.length > EditorLimit.EditableObjectImportMaximum)
					statement.fail(`a script can draw at most ${EditorLimit.EditableObjectImportMaximum} items`);
		}
	});
	if (!commands.length && !image) throw new DrawScriptError('The script draws nothing.');
	return { ...(image ? { image } : {}), commands, lines };
}

/** One line: its keyword and the words after it, read in order. */
class Statement {
	#index = 0;
	readonly #ends = new Map<string, LineEnd>();
	#fill: string | undefined;
	#gradient: Gradient | undefined;

	constructor(
		readonly keyword: string,
		private readonly words: readonly string[],
		private readonly line: number,
	) {}

	image(): Readonly<{ name: string; spec: NewImageSpec }> {
		const name = this.next('a file name');
		const [width, height] = this.size();
		if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION)
			this.fail(`an image side can be at most ${MAX_CANVAS_DIMENSION} pixels`);
		const background = this.peek();
		const transparent = background === Option.Transparent;
		if (background !== undefined) this.#index++;
		if (background !== undefined && !transparent) this.color(background);
		this.end();
		return {
			name,
			spec: {
				width: Math.round(width),
				height: Math.round(height),
				background: !background || transparent ? DrawingDefault.Background : background,
				transparent,
			},
		};
	}

	item(): DrawingCommand {
		if (this.keyword === Keyword.Line || this.keyword === Keyword.Arrow) return this.connector();
		if (this.keyword === Keyword.Text) return this.text();
		if (this.keyword === Keyword.Path) return this.path();
		const shape = BOX_SHAPES[this.keyword];
		if (!shape) return this.fail(`unknown statement "${this.keyword}"`);
		const [x, y] = this.point();
		const [width, height] = this.keyword === Keyword.Circle ? this.diameter() : this.size();
		const color = this.color(this.next('a colour'));
		const options = this.options([Option.Outline, Option.Opacity, Option.Rotate, Option.Fill]);
		const fillColor = this.#fill;
		const fillGradient = this.#gradient;
		return {
			kind: AssistantCommandKind.AddShape,
			shape,
			rect: { x, y, width, height },
			color,
			fill: Boolean(fillColor || fillGradient) || !(Option.Outline in options),
			...(fillColor ? { fillColor } : {}),
			...(fillGradient ? { fillGradient } : {}),
			strokeWidth: options[Option.Outline] ?? DrawingDefault.StrokeWidth,
			opacity: this.opacity(options[Option.Opacity]),
			rotation: options[Option.Rotate] ?? DrawingDefault.Rotation,
		};
	}

	/** A line or arrow through two or more points; the points between the ends are its bends. */
	private connector(): DrawingCommand {
		const points = [this.point(), this.point()];
		while (POINT.test(this.peek() ?? '')) points.push(this.point());
		const [from, ...rest] = points.map(([x, y]) => ({ x, y }));
		const to = rest.pop()!;
		const color = this.color(this.next('a colour'));
		const options = this.options([Option.Width, Option.Opacity, Option.Dashed, Option.Head, Option.Tail]);
		const head = this.#ends.get(Option.Head);
		const tail = this.#ends.get(Option.Tail);
		return {
			kind: AssistantCommandKind.AddLine,
			from: from!,
			...(rest.length ? { via: rest } : {}),
			to,
			arrow: this.keyword === Keyword.Arrow,
			color,
			width: this.positive(options[Option.Width] ?? DrawingDefault.StrokeWidth, Option.Width),
			opacity: this.opacity(options[Option.Opacity]),
			...(Option.Dashed in options ? { dashed: true } : {}),
			...(head ? { head } : {}),
			...(tail ? { tail } : {}),
		};
	}

	/** A vector path from SVG path data in quotes, with a line colour and the options lines take, and a fill. */
	private path(): DrawingCommand {
		const data = this.next('path data in quotes');
		if (!data.startsWith(QUOTE)) this.fail('path needs its data in quotes, such as "M10 10 C 40 0 60 0 90 10"');
		const d = data.slice(1);
		try {
			parsePathData(d);
		} catch (error) {
			this.fail(error instanceof Error ? error.message.replace(/\.$/, '') : String(error));
		}
		const color = this.color(this.next('a colour'));
		const options = this.options([Option.Width, Option.Opacity, Option.Dashed, Option.Head, Option.Tail, Option.Fill]);
		const fillColor = this.#fill;
		const fillGradient = this.#gradient;
		const head = this.#ends.get(Option.Head);
		const tail = this.#ends.get(Option.Tail);
		return {
			kind: AssistantCommandKind.AddPath,
			d,
			color,
			width: this.positive(options[Option.Width] ?? DrawingDefault.StrokeWidth, Option.Width),
			opacity: this.opacity(options[Option.Opacity]),
			...(fillColor ? { fill: true, fillColor } : {}),
			...(fillGradient ? { fill: true, fillGradient } : {}),
			...(Option.Dashed in options ? { dashed: true } : {}),
			...(head ? { head } : {}),
			...(tail ? { tail } : {}),
		};
	}

	private text(): DrawingCommand {
		const [x, y] = this.point();
		const color = this.color(this.next('a colour'));
		const last = this.words.at(-1);
		if (!last?.startsWith(QUOTE)) this.fail('text needs its words in quotes at the end');
		const options = this.options([Option.Size], this.words.length - 1);
		return {
			kind: AssistantCommandKind.AddText,
			at: { x, y },
			text: last!.slice(1),
			color,
			size: this.positive(options[Option.Size] ?? DrawingDefault.FontSize, Option.Size),
		};
	}

	/** Named options in any order, each with a number; "outline" may stand alone. */
	private options(allowed: readonly string[], end = this.words.length): Partial<Record<string, number>> {
		const values: Partial<Record<string, number>> = {};
		while (this.#index < end) {
			const name = this.next('an option').toLowerCase();
			if (!allowed.includes(name)) this.fail(`unknown option "${name}"; use ${allowed.join(', ')}`);
			const value = this.peek();
			const number = value === undefined ? Number.NaN : Number(value);
			if (FLAG_OPTIONS.has(name)) values[name] = FLAG_SET;
			else if (this.wordOption(name)) continue;
			else if (Number.isFinite(number) && this.#index < end) {
				this.#index++;
				values[name] = number;
			} else if (name === Option.Outline) values[name] = DrawingDefault.StrokeWidth;
			else this.fail(`${name} needs a number`);
		}
		this.#index = this.words.length;
		return values;
	}

	/** The rest of the line as one name, quotes optional. */
	rest(): string {
		const name = this.words.map((word) => (word.startsWith(QUOTE) ? word.slice(1) : word)).join(' ').trim();
		if (!name) this.fail(`${this.keyword} needs a layer name`);
		return name;
	}

	private point(): readonly [number, number] {
		const match = POINT.exec(this.next('a point such as 10,20'));
		if (!match) return this.fail(`expected a point such as 10,20 but found "${this.words[this.#index - 1]}"`);
		return [Number(match[1]), Number(match[2])];
	}

	private size(): readonly [number, number] {
		const match = SIZE.exec(this.next('a size such as 100x50'));
		if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0)
			return this.fail(`expected a size such as 100x50 but found "${this.words[this.#index - 1]}"`);
		return [Number(match[1]), Number(match[2])];
	}

	private diameter(): readonly [number, number] {
		const diameter = this.positive(Number(this.next('a diameter')), 'the diameter');
		return [diameter, diameter];
	}

	/** Reads an option followed by a word, such as an end or a colour; whether it was one. */
	private wordOption(name: string): boolean {
		if (END_OPTIONS.has(name)) this.#ends.set(name, this.lineEnd(name));
		else if (name === Option.Fill) this.readFill(this.next(`a colour or gradient after ${Option.Fill}`));
		else return false;
		return true;
	}

	/** A fill colour, or a gradient written as linear(#a,#b) or radial(#a,#b). */
	private readFill(value: string): void {
		const gradient = GRADIENT_FILL.exec(value);
		if (!gradient) {
			this.#fill = this.color(value);
			return;
		}
		const parts = gradient[2]!.split(',').map((part) => part.trim());
		const angle = GRADIENT_ANGLE.exec(parts[0] ?? '');
		const colors = (angle ? parts.slice(1) : parts).map((color) => this.color(color));
		if (colors.length < MINIMUM_GRADIENT_STOPS) this.fail(`a gradient needs at least ${MINIMUM_GRADIENT_STOPS} colours`);
		this.#gradient = gradientOf(gradient[1]!.toLowerCase() as GradientKind, colors, angle ? Number(angle[1]) : undefined);
	}

	private lineEnd(option: string): LineEnd {
		const value = this.next(`an end after ${option}`);
		const end = LINE_ENDS.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
		if (!end || !isLineEnd(end)) return this.fail(`${option} is one of ${LINE_ENDS.join(', ')}`);
		return end;
	}

	private color(value: string): string {
		if (!COLOR.test(value)) this.fail(`expected a colour such as #d62828 but found "${value}"`);
		return value;
	}

	private opacity(value: number | undefined): number {
		const opacity = value ?? DrawingDefault.Opacity;
		if (opacity < 0 || opacity > 1) this.fail('opacity must be from 0 to 1');
		return opacity;
	}

	private positive(value: number, what: string): number {
		if (!Number.isFinite(value) || value <= 0) this.fail(`${what} must be a positive number`);
		return value;
	}

	private next(what: string): string {
		const word = this.words[this.#index++];
		if (word === undefined) this.fail(`${this.keyword} needs ${what}`);
		return word!;
	}

	private peek(): string | undefined {
		return this.words[this.#index];
	}

	private end(): void {
		if (this.#index < this.words.length) this.fail(`unexpected "${this.words[this.#index]}"`);
	}

	fail(message: string): never {
		throw new DrawScriptError(`Line ${this.line}: ${message}.`);
	}
}

/** Words separated by spaces; a quoted part is one word, kept with its opening quote to mark it. */
function tokens(text: string, line: number): string[] {
	const words: string[] = [];
	let index = 0;
	while (index < text.length) {
		if (/\s/.test(text[index]!)) {
			index++;
			continue;
		}
		const [word, next] = text[index] === QUOTE ? quotedWord(text, index, line) : plainWord(text, index);
		words.push(word);
		index = next;
	}
	return words;
}

function plainWord(text: string, start: number): readonly [string, number] {
	const length = text.slice(start).search(/\s/);
	const end = length === -1 ? text.length : start + length;
	return [text.slice(start, end), end];
}

/** A quoted word with its escapes resolved, and where the text after its closing quote starts. */
function quotedWord(text: string, start: number, line: number): readonly [string, number] {
	let word = QUOTE;
	let index = start + 1;
	while (text[index] !== QUOTE) {
		if (index >= text.length) throw new DrawScriptError(`Line ${line}: a quote is not closed.`);
		const character = text[index++]!;
		word += character === '\\' ? (ESCAPES[text[index++] ?? ''] ?? '') : character;
	}
	return [word, index + 1];
}
