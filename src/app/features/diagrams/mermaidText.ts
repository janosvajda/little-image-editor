/**
 * Reading helpers shared by the Mermaid diagram readers: statements, labels
 * and a cursor that reads a statement from left to right.
 */

/** A Mermaid comment starts with this. */
export const COMMENT = '%%';
const BREAK = /<br\s*\/?>/gi;
/** Statements every diagram accepts and ignores: styling, links and accessibility text. */
export const STYLING_STATEMENT = /^(classDef|class|style|linkStyle|click|cssClass|callback|link|accTitle|accDescr)\b/;

/** A mistake in a diagram's source, named with its line. */
export class DiagramSyntaxError extends Error {}

/** A statement and the line it is on, for messages. */
export interface SourceStatement {
	readonly text: string;
	readonly line: number;
}

/** A diagram's statements in order, without comments, empty ones or Mermaid's settings. */
export function sourceStatements(source: string): SourceStatement[] {
	return source.split(/\r?\n/).flatMap((text, index) =>
		statements(text)
			.filter((statement) => statement && !statement.startsWith(COMMENT))
			.map((statement) => ({ text: statement, line: index + 1 })),
	);
}

export function syntaxError(line: number, message: string): DiagramSyntaxError {
	return new DiagramSyntaxError(`Line ${line}: ${message}.`);
}

/** Reads one statement from left to right. */
export class Cursor {
	#position = 0;

	constructor(private readonly text: string) {}

	done(): boolean {
		this.space();
		return this.#position >= this.text.length;
	}

	space(): void {
		while (/\s/.test(this.text[this.#position] ?? '')) this.#position++;
	}

	skip(symbol: string): boolean {
		this.space();
		if (!this.text.startsWith(symbol, this.#position)) return false;
		this.#position += symbol.length;
		return true;
	}

	startsWith(symbol: string): boolean {
		return this.text.startsWith(symbol, this.#position);
	}

	/** The matched text when the pattern matches here; the whole match, or its first group by default. */
	match(pattern: RegExp, whole = false): string | null {
		const found = pattern.exec(this.text.slice(this.#position));
		if (!found) return null;
		this.#position += found[0].length;
		return whole ? found[0] : (found[1] ?? found[0]);
	}

	/** A label between brackets; a quoted label may contain the closing bracket. */
	between(open: string, close: string): string | null {
		const start = this.#position + open.length;
		const quoted = this.text[start] === '"' ? this.text.indexOf('"', start + 1) : -1;
		const end = this.text.indexOf(close, quoted === -1 ? start : quoted + 1);
		if (end === -1) return null;
		this.#position = end + close.length;
		return this.text.slice(start, end);
	}

	quoted(): string | null {
		const found = /^"([^"]*)"/.exec(this.text.slice(this.#position));
		if (!found) return null;
		this.#position += found[0].length;
		this.space();
		return found[1]!;
	}

	rest(): string {
		return this.text.slice(this.#position).trim();
	}
}

const OPENING_BRACKETS = '([{';
const CLOSING_BRACKETS = ')]}';
const STATEMENT_SEPARATOR = ';';

/** A line's statements, split at semicolons outside quotes and brackets. */
export function statements(line: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quoted = false;
	let start = 0;
	for (let index = 0; index < line.length; index++) {
		const character = line[index]!;
		if (character === '"') quoted = !quoted;
		else if (!quoted && OPENING_BRACKETS.includes(character)) depth++;
		else if (!quoted && CLOSING_BRACKETS.includes(character)) depth = Math.max(0, depth - 1);
		else if (!quoted && depth === 0 && character === STATEMENT_SEPARATOR) {
			parts.push(line.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(line.slice(start));
	return parts.map((part) => part.trim());
}

export function lines(label: string): string[] {
	return clean(label)
		.split(BREAK)
		.map((line) => line.trim())
		.filter(Boolean);
}

/** A label without its surrounding quotes or extra spaces. */
export function clean(label: string): string {
	const trimmed = label.trim();
	return (trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed).trim();
}
