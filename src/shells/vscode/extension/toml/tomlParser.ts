/**
 * A TOML 1.0 reader for the assistant configuration files. Besides the values
 * it reports where each statement is in the text, so `TomlEditor` can change
 * one entry while leaving comments, formatting and every other setting alone.
 * Dates and times are returned as their original text.
 */

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
export interface TomlTable {
	[key: string]: TomlValue;
}

export const TomlStatementKind = {
	Table: 'table',
	ArrayTable: 'arrayTable',
	KeyValue: 'keyValue',
} as const;
export type TomlStatementKind = (typeof TomlStatementKind)[keyof typeof TomlStatementKind];

/** One line-level statement: a table header or a key/value pair, with its place in the text. */
export interface TomlStatement {
	readonly kind: TomlStatementKind;
	/** The full key path: a header's table, or a key below its table. */
	readonly path: readonly string[];
	/** The table the statement belongs to; the root table is empty. */
	readonly table: readonly string[];
	/** Inside an array of tables, where paths do not name one place. */
	readonly inArrayTable: boolean;
	/** From the start of the statement's first line to the end of its last line, newline included. */
	readonly start: number;
	readonly end: number;
	/** Where the value's text is, for key/value pairs. */
	readonly valueStart: number;
	readonly valueEnd: number;
}

export interface ParsedToml {
	readonly value: TomlTable;
	readonly statements: readonly TomlStatement[];
}

export class TomlSyntaxError extends Error {
	constructor(message: string, line: number) {
		super(`${message} (line ${line})`);
	}
}

const Radix = { Binary: 2, Octal: 8, Decimal: 10, Hex: 16 } as const;
const HEX_DIGITS_SHORT_ESCAPE = 4;
const HEX_DIGITS_LONG_ESCAPE = 8;
const MULTILINE_DELIMITER_LENGTH = 3;
/** A multi-line string may end with up to two quotes before its closing delimiter. */
const MAX_QUOTES_BEFORE_CLOSING = 2;
const BARE_KEY = /^[A-Za-z0-9_-]+$/;
/** Control characters below this, and DELETE, are written as unicode escapes. */
const FIRST_PRINTABLE_CODE = 0x20;
const DELETE_CHARACTER = '\u007f';
const NUMBER_PREFIX = { Hex: '0x', Octal: '0o', Binary: '0b' } as const;
const DATE_TIME_PATTERNS: readonly RegExp[] = [
	/^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$/,
	/^\d{2}:\d{2}:\d{2}(\.\d+)?$/,
];
const DECIMAL_INTEGER = /^[+-]?(0|[1-9](_?\d)*)$/;
const PREFIXED_INTEGER: Readonly<Record<string, readonly [RegExp, number]>> = {
	[NUMBER_PREFIX.Hex]: [/^0x[0-9A-Fa-f](_?[0-9A-Fa-f])*$/, Radix.Hex],
	[NUMBER_PREFIX.Octal]: [/^0o[0-7](_?[0-7])*$/, Radix.Octal],
	[NUMBER_PREFIX.Binary]: [/^0b[01](_?[01])*$/, Radix.Binary],
};
const FLOAT = /^[+-]?(0|[1-9](_?\d)*)(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
const SPECIAL_FLOAT = /^[+-]?(inf|nan)$/;
const SCALAR_CHARACTER = /[0-9A-Za-z_+\-.:]/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LINE_JOIN = /^[ \t]*\r?\n\s*/;
const ESCAPES: Readonly<Record<string, string>> = {
	b: '\b',
	t: '\t',
	n: '\n',
	f: '\f',
	r: '\r',
	'"': '"',
	'\\': '\\',
};

/** How a table came to exist, which decides what may still add to it. */
const TableOrigin = {
	Header: 'header',
	Implicit: 'implicit',
	DottedKey: 'dottedKey',
	Inline: 'inline',
} as const;
type TableOrigin = (typeof TableOrigin)[keyof typeof TableOrigin];

export function parseToml(source: string): ParsedToml {
	return new Parser(source).parse();
}

class Parser {
	#position = 0;
	#line = 1;
	readonly #root: TomlTable = {};
	readonly #origins = new WeakMap<TomlTable, TableOrigin>();
	readonly #tableArrays = new WeakSet<TomlValue[]>();
	readonly #statements: TomlStatement[] = [];
	#table: TomlTable = this.#root;
	#tablePath: readonly string[] = [];
	#inArrayTable = false;
	readonly #arrayTablePaths: (readonly string[])[] = [];

	constructor(private readonly source: string) {}

	parse(): ParsedToml {
		while (this.#position < this.source.length) {
			const start = this.#position;
			this.skipBlanks();
			if (this.atLineEnd()) {
				this.endLine();
				continue;
			}
			if (this.peek() === '[') this.header(start);
			else this.keyValue(start);
		}
		return { value: this.#root, statements: this.#statements };
	}

	private header(start: number): void {
		const isArray = this.source.startsWith('[[', this.#position);
		this.#position += isArray ? 2 : 1;
		this.skipBlanks();
		const path = this.key();
		this.skipBlanks();
		this.expect(isArray ? ']]' : ']');
		if (isArray) {
			this.defineArrayTable(path);
			this.#arrayTablePaths.push(path);
		} else this.defineTable(path);
		this.#tablePath = path;
		this.#inArrayTable = this.#arrayTablePaths.some((arrayPath) => isPrefix(arrayPath, path));
		this.endStatement();
		this.#statements.push({
			kind: isArray ? TomlStatementKind.ArrayTable : TomlStatementKind.Table,
			path,
			table: path,
			inArrayTable: this.#inArrayTable,
			start,
			end: this.#position,
			valueStart: this.#position,
			valueEnd: this.#position,
		});
	}

	private keyValue(start: number): void {
		const key = this.key();
		this.skipBlanks();
		this.expect('=');
		this.skipBlanks();
		const valueStart = this.#position;
		const value = this.value();
		const valueEnd = this.#position;
		this.assign(this.#table, key, value);
		this.endStatement();
		this.#statements.push({
			kind: TomlStatementKind.KeyValue,
			path: [...this.#tablePath, ...key],
			table: this.#tablePath,
			inArrayTable: this.#inArrayTable,
			start,
			end: this.#position,
			valueStart,
			valueEnd,
		});
	}

	/** A table header: may complete a table its sub-tables created, but never define one twice. */
	private defineTable(path: readonly string[]): void {
		const parent = this.descend(this.#root, path.slice(0, -1));
		const name = path.at(-1)!;
		const existing = parent[name];
		if (existing === undefined) {
			this.#table = this.newTable(TableOrigin.Header);
			parent[name] = this.#table;
			return;
		}
		if (!isTable(existing) || this.#origins.get(existing) !== TableOrigin.Implicit)
			this.fail(`The table ${path.join('.')} is defined twice`);
		this.#origins.set(existing, TableOrigin.Header);
		this.#table = existing;
	}

	private defineArrayTable(path: readonly string[]): void {
		const parent = this.descend(this.#root, path.slice(0, -1));
		const name = path.at(-1)!;
		const existing = parent[name] ?? [];
		if (!Array.isArray(existing) || (parent[name] !== undefined && !this.#tableArrays.has(existing)))
			this.fail(`${path.join('.')} is not an array of tables`);
		this.#tableArrays.add(existing);
		this.#table = this.newTable(TableOrigin.Header);
		existing.push(this.#table);
		parent[name] = existing;
	}

	/** Walks to a table, creating missing ones; an array of tables continues in its last table. */
	private descend(from: TomlTable, keys: readonly string[], origin: TableOrigin = TableOrigin.Implicit): TomlTable {
		let table = from;
		for (const key of keys) {
			const existing = table[key];
			if (existing === undefined) {
				const created = this.newTable(origin);
				table[key] = created;
				table = created;
			} else if (Array.isArray(existing) && this.#tableArrays.has(existing)) {
				table = existing.at(-1) as TomlTable;
			} else if (isTable(existing) && this.#origins.get(existing) !== TableOrigin.Inline) {
				table = existing;
			} else {
				this.fail(`${key} is already a value and cannot hold keys`);
			}
		}
		return table;
	}

	private assign(table: TomlTable, key: readonly string[], value: TomlValue): void {
		const parent = this.descend(table, key.slice(0, -1), TableOrigin.DottedKey);
		const name = key.at(-1)!;
		if (Object.hasOwn(parent, name)) this.fail(`The key ${key.join('.')} is defined twice`);
		parent[name] = value;
	}

	private newTable(origin: TableOrigin): TomlTable {
		const table: TomlTable = {};
		this.#origins.set(table, origin);
		return table;
	}

	/** A dotted key: bare or quoted parts joined by dots. */
	private key(): string[] {
		const parts = [this.keyPart()];
		this.skipBlanks();
		while (this.peek() === '.') {
			this.#position++;
			this.skipBlanks();
			parts.push(this.keyPart());
			this.skipBlanks();
		}
		return parts;
	}

	private keyPart(): string {
		const next = this.peek();
		if (next === '"') return this.basicString();
		if (next === "'") return this.literalString();
		const start = this.#position;
		while (/[A-Za-z0-9_-]/.test(this.peek())) this.#position++;
		if (start === this.#position) this.fail('A key is missing');
		return this.source.slice(start, this.#position);
	}

	private value(): TomlValue {
		const next = this.peek();
		if (this.source.startsWith('"""', this.#position)) return this.multilineString('"');
		if (this.source.startsWith("'''", this.#position)) return this.multilineString("'");
		if (next === '"') return this.basicString();
		if (next === "'") return this.literalString();
		if (next === '[') return this.array();
		if (next === '{') return this.inlineTable();
		return this.scalar();
	}

	private basicString(): string {
		this.#position++;
		let text = '';
		for (;;) {
			const character = this.source[this.#position];
			if (character === undefined || character === '\n') this.fail('A string is not closed');
			this.#position++;
			if (character === '"') return text;
			if (character !== '\\') {
				text += character;
				continue;
			}
			const [decoded, length] = decodeEscape(this.source, this.#position, (message) => this.fail(message));
			text += decoded;
			this.#position += length;
		}
	}

	private literalString(): string {
		const end = this.source.indexOf("'", this.#position + 1);
		const newline = this.source.indexOf('\n', this.#position);
		if (end === -1 || (newline !== -1 && newline < end)) this.fail('A string is not closed');
		const text = this.source.slice(this.#position + 1, end);
		this.#position = end + 1;
		return text;
	}

	private multilineString(quote: string): string {
		const delimiter = quote.repeat(MULTILINE_DELIMITER_LENGTH);
		this.#position += MULTILINE_DELIMITER_LENGTH;
		if (this.source.startsWith('\r\n', this.#position)) this.#position += 2;
		else if (this.peek() === '\n') this.#position++;
		let close = this.source.indexOf(delimiter, this.#position);
		if (close === -1) this.fail('A multi-line string is not closed');
		let extraQuotes = 0;
		while (this.source[close + MULTILINE_DELIMITER_LENGTH] === quote && extraQuotes < MAX_QUOTES_BEFORE_CLOSING) {
			close++;
			extraQuotes++;
		}
		const raw = this.source.slice(this.#position, close);
		this.#line += raw.split('\n').length - 1;
		this.#position = close + MULTILINE_DELIMITER_LENGTH;
		return quote === "'" ? raw : unescapeMultiline(raw, (message) => this.fail(message));
	}

	private array(): TomlValue[] {
		this.#position++;
		const items: TomlValue[] = [];
		for (;;) {
			this.skipSpaceCommentsAndNewlines();
			if (this.peek() === ']') break;
			items.push(this.value());
			this.skipSpaceCommentsAndNewlines();
			if (this.peek() === ',') this.#position++;
			else if (this.peek() !== ']') this.fail('An array needs a comma between values');
		}
		this.#position++;
		return items;
	}

	private inlineTable(): TomlTable {
		this.#position++;
		const table = this.newTable(TableOrigin.Header);
		this.skipBlanks();
		if (this.peek() === '}') {
			this.#position++;
			this.#origins.set(table, TableOrigin.Inline);
			return table;
		}
		for (;;) {
			this.skipBlanks();
			const key = this.key();
			this.expect('=');
			this.skipBlanks();
			this.assign(table, key, this.value());
			this.skipBlanks();
			if (this.peek() === '}') break;
			this.expect(',');
		}
		this.#position++;
		this.#origins.set(table, TableOrigin.Inline);
		return table;
	}

	/** Booleans, numbers and dates, written without quotes. */
	private scalar(): TomlValue {
		const start = this.#position;
		this.skipScalarCharacters();
		// A date and a time may be separated by a space.
		const datePart = this.source.slice(start, this.#position);
		if (this.peek() === ' ' && LOCAL_DATE.test(datePart) && /\d/.test(this.source[this.#position + 1] ?? '')) {
			this.#position++;
			this.skipScalarCharacters();
		}
		const text = this.source.slice(start, this.#position);
		const value = scalarValue(text);
		return value ?? this.fail(text ? `${text} is not a valid value` : 'A value is missing');
	}

	private skipScalarCharacters(): void {
		while (SCALAR_CHARACTER.test(this.peek())) this.#position++;
	}

	/** After a statement only a comment may follow on its line. */
	private endStatement(): void {
		this.skipBlanks();
		if (!this.atLineEnd()) this.fail('Unexpected text after a statement');
		this.endLine();
	}

	private atLineEnd(): boolean {
		const next = this.peek();
		return next === '' || next === '\n' || next === '#' || this.source.startsWith('\r\n', this.#position);
	}

	/** Skips a comment and the newline that ends the line. */
	private endLine(): void {
		if (this.peek() === '#') {
			const newline = this.source.indexOf('\n', this.#position);
			this.#position = newline === -1 ? this.source.length : newline;
		}
		if (this.source.startsWith('\r\n', this.#position)) this.#position += 2;
		else if (this.peek() === '\n') this.#position++;
		this.#line++;
	}

	private skipBlanks(): void {
		while (this.peek() === ' ' || this.peek() === '\t') this.#position++;
	}

	private skipSpaceCommentsAndNewlines(): void {
		for (;;) {
			this.skipBlanks();
			if (this.peek() === '#' || this.peek() === '\n' || this.source.startsWith('\r\n', this.#position)) {
				this.endLine();
				continue;
			}
			return;
		}
	}

	private expect(text: string): void {
		if (!this.source.startsWith(text, this.#position)) this.fail(`Expected ${text}`);
		this.#position += text.length;
	}

	private peek(): string {
		return this.source[this.#position] ?? '';
	}

	private fail(message: string): never {
		throw new TomlSyntaxError(message, this.#line);
	}
}

/** Escapes in a multi-line basic string, where a backslash at a line end joins the lines. */
function unescapeMultiline(raw: string, fail: (message: string) => never): string {
	let text = '';
	let index = 0;
	while (index < raw.length) {
		const character = raw[index]!;
		index++;
		if (character !== '\\') {
			text += character;
			continue;
		}
		const lineJoin = LINE_JOIN.exec(raw.slice(index));
		if (lineJoin) {
			index += lineJoin[0].length;
			continue;
		}
		const [decoded, length] = decodeEscape(raw, index, fail);
		text += decoded;
		index += length;
	}
	return text;
}

/** The character an escape stands for, read just after its backslash, and how many characters it used. */
function decodeEscape(text: string, index: number, fail: (message: string) => never): readonly [string, number] {
	const code = text[index];
	if (code !== undefined && code in ESCAPES) return [ESCAPES[code]!, 1];
	const length = code === 'u' ? HEX_DIGITS_SHORT_ESCAPE : code === 'U' ? HEX_DIGITS_LONG_ESCAPE : 0;
	const digits = text.slice(index + 1, index + 1 + length);
	if (!length || digits.length !== length || !/^[0-9A-Fa-f]+$/.test(digits))
		return fail('An escape sequence is not valid');
	return [String.fromCodePoint(Number.parseInt(digits, Radix.Hex)), 1 + length];
}

/** A boolean, number or date written without quotes, or undefined when the text is none of them. */
function scalarValue(text: string): TomlValue | undefined {
	if (text === 'true') return true;
	if (text === 'false') return false;
	if (DATE_TIME_PATTERNS.some((pattern) => pattern.test(text))) return text;
	const prefixed = PREFIXED_INTEGER[text.slice(0, NUMBER_PREFIX.Hex.length)];
	if (prefixed?.[0].test(text))
		return Number.parseInt(text.slice(NUMBER_PREFIX.Hex.length).replaceAll('_', ''), prefixed[1]);
	if (DECIMAL_INTEGER.test(text)) return Number.parseInt(text.replaceAll('_', ''), Radix.Decimal);
	if (SPECIAL_FLOAT.test(text))
		return text.endsWith('nan') ? Number.NaN : text.startsWith('-') ? -Infinity : Infinity;
	if (FLOAT.test(text) && /[.eE]/.test(text)) return Number.parseFloat(text.replaceAll('_', ''));
	return undefined;
}

export function isTable(value: unknown): value is TomlTable {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPrefix(prefix: readonly string[], path: readonly string[]): boolean {
	return prefix.length <= path.length && prefix.every((part, index) => part === path[index]);
}

/** A key part as TOML writes it: bare when it can be, otherwise quoted. */
export function formatKey(key: string): string {
	return BARE_KEY.test(key) ? key : formatString(key);
}

export function formatString(text: string): string {
	let quoted = '"';
	for (const character of text) {
		const escape = Object.entries(ESCAPES).find(([, value]) => value === character)?.[0];
		if (escape) quoted += `\\${escape}`;
		else if (character.codePointAt(0)! < FIRST_PRINTABLE_CODE || character === DELETE_CHARACTER)
			quoted += `\\u${character.codePointAt(0)!.toString(Radix.Hex).padStart(HEX_DIGITS_SHORT_ESCAPE, '0')}`;
		else quoted += character;
	}
	return `${quoted}"`;
}

/** A value as TOML writes it on one line; tables become inline tables. */
export function formatValue(value: TomlValue): string {
	if (typeof value === 'string') return formatString(value);
	if (typeof value === 'boolean') return String(value);
	if (typeof value === 'number') {
		if (Number.isNaN(value)) return 'nan';
		if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
	const entries = Object.entries(value).map(([key, item]) => `${formatKey(key)} = ${formatValue(item)}`);
	return entries.length ? `{ ${entries.join(', ')} }` : '{}';
}
