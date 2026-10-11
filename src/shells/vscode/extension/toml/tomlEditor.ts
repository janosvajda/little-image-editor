import {
	formatKey,
	formatValue,
	isPrefix,
	isTable,
	type ParsedToml,
	parseToml,
	type TomlStatement,
	TomlStatementKind,
	type TomlTable,
	type TomlValue,
} from './tomlParser';

const NEWLINE = '\n';

/** A change that would not leave a valid file is refused, so the file is never damaged. */
export class TomlEditError extends Error {}

interface TextEdit {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

/**
 * Changes single entries of a TOML file and leaves everything else as it was
 * written: comments, blank lines, key order, quoting and other tables. Each
 * change is checked by reading the result again.
 */
export class TomlEditor {
	#source: string;
	#parsed: ParsedToml;

	constructor(source: string) {
		this.#source = source;
		this.#parsed = parseToml(source);
	}

	get text(): string {
		return this.#source;
	}

	get value(): TomlTable {
		return this.#parsed.value;
	}

	/** The value at a path, or undefined when nothing is there. */
	get(path: readonly string[]): TomlValue | undefined {
		let value: TomlValue | undefined = this.#parsed.value;
		for (const key of path) value = isTable(value) ? value[key] : undefined;
		return value;
	}

	/** Gives a key a value, replacing what was there or adding it to its table. */
	set(path: readonly string[], value: TomlValue): this {
		if (this.definedBelow(path)) this.remove(path);
		const statements = this.statements();
		const exact = statements.find((statement) => isKeyValue(statement) && samePath(statement.path, path));
		if (exact) return this.apply([{ start: exact.valueStart, end: exact.valueEnd, text: formatValue(value) }]);
		const container = statements.find((statement) => isKeyValue(statement) && isStrictPrefix(statement.path, path));
		if (container) return this.rewriteInline(container, (table) => setIn(table, path.slice(container.path.length), value));
		return this.apply([this.insertion(path, value)]);
	}

	/** Removes a key or a whole table, with its sub-tables; nothing happens when it is not there. */
	remove(path: readonly string[]): this {
		const statements = this.statements();
		const container = statements.find((statement) => isKeyValue(statement) && isStrictPrefix(statement.path, path));
		if (container) return this.rewriteInline(container, (table) => removeIn(table, path.slice(container.path.length)));
		const edits: TextEdit[] = [];
		for (const header of statements.filter((statement) => isHeader(statement) && isPrefix(path, statement.path)))
			edits.push({ start: header.start, end: this.blockEnd(header), text: '' });
		for (const statement of statements)
			if (
				isKeyValue(statement) &&
				isPrefix(path, statement.path) &&
				!edits.some((edit) => statement.start >= edit.start && statement.start < edit.end)
			)
				edits.push({ start: statement.start, end: statement.end, text: '' });
		return edits.length ? this.apply(edits) : this;
	}

	private statements(): readonly TomlStatement[] {
		return this.#parsed.statements.filter((statement) => !statement.inArrayTable);
	}

	/** Whether a table header or dotted keys define the path's contents, so a value cannot simply replace it. */
	private definedBelow(path: readonly string[]): boolean {
		return this.statements().some(
			(statement) =>
				(isHeader(statement) && isPrefix(path, statement.path)) ||
				(isKeyValue(statement) && isStrictPrefix(path, statement.path)),
		);
	}

	/** Where a new key goes: into its table's block, beside the dotted keys that make its table, or a new table. */
	private insertion(path: readonly string[], value: TomlValue): TextEdit {
		const parent = path.slice(0, -1);
		const statements = this.statements();
		const header = statements.find((statement) => statement.kind === TomlStatementKind.Table && samePath(statement.path, parent));
		if (header || parent.length === 0) {
			const table = header?.path ?? [];
			const last = statements.filter((statement) => isKeyValue(statement) && samePath(statement.table, table) && this.inBlock(statement, header)).at(-1);
			return this.line(last?.end ?? header?.end ?? 0, path.slice(table.length), value);
		}
		const dotted = statements.filter((statement) => isKeyValue(statement) && isStrictPrefix(parent, statement.path)).at(-1);
		if (dotted) return this.line(dotted.end, path.slice(dotted.table.length), value);
		const separator = this.#source.length === 0 ? '' : this.#source.endsWith(NEWLINE) ? NEWLINE : NEWLINE + NEWLINE;
		return {
			start: this.#source.length,
			end: this.#source.length,
			text: `${separator}[${parent.map(formatKey).join('.')}]${NEWLINE}${formatKeyValue(path.slice(-1), value)}${NEWLINE}`,
		};
	}

	private line(at: number, key: readonly string[], value: TomlValue): TextEdit {
		const needsNewline = at > 0 && this.#source[at - 1] !== NEWLINE;
		return { start: at, end: at, text: `${needsNewline ? NEWLINE : ''}${formatKeyValue(key, value)}${NEWLINE}` };
	}

	/** Whether a statement lies in a table header's block; without a header, in the root block before the first one. */
	private inBlock(statement: TomlStatement, header: TomlStatement | undefined): boolean {
		if (!header) return statement.start < (this.statements().find(isHeader)?.start ?? Number.POSITIVE_INFINITY);
		return statement.start >= header.end && statement.start < this.blockEnd(header);
	}

	/** Where a header's block ends: at the next header, of any kind, or the end of the text. */
	private blockEnd(header: TomlStatement): number {
		return this.#parsed.statements.find((statement) => isHeader(statement) && statement.start > header.start)?.start ?? this.#source.length;
	}

	/** Replaces an inline table's text after changing a copy of its value. */
	private rewriteInline(statement: TomlStatement, change: (table: TomlTable) => void): this {
		const current = this.get(statement.path);
		if (!isTable(current)) throw new TomlEditError(`${statement.path.join('.')} is not a table.`);
		const copy = structuredClone(current);
		change(copy);
		return this.apply([{ start: statement.valueStart, end: statement.valueEnd, text: formatValue(copy) }]);
	}

	private apply(edits: readonly TextEdit[]): this {
		let source = this.#source;
		for (const edit of [...edits].sort((left, right) => right.start - left.start))
			source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
		try {
			this.#parsed = parseToml(source);
		} catch (error) {
			throw new TomlEditError(
				`The change would not leave valid TOML (${error instanceof Error ? error.message : String(error)}); the file was left unchanged.`,
			);
		}
		this.#source = source;
		return this;
	}
}

function formatKeyValue(key: readonly string[], value: TomlValue): string {
	return `${key.map(formatKey).join('.')} = ${formatValue(value)}`;
}

function setIn(table: TomlTable, path: readonly string[], value: TomlValue): void {
	const parent = path.slice(0, -1).reduce<TomlTable>((current, key) => {
		const next = current[key];
		if (isTable(next)) return next;
		const created: TomlTable = {};
		current[key] = created;
		return created;
	}, table);
	parent[path.at(-1)!] = value;
}

function removeIn(table: TomlTable, path: readonly string[]): void {
	let parent: TomlValue | undefined = table;
	for (const key of path.slice(0, -1)) parent = isTable(parent) ? parent[key] : undefined;
	if (isTable(parent)) delete parent[path.at(-1)!];
}

function isHeader(statement: TomlStatement): boolean {
	return statement.kind !== TomlStatementKind.KeyValue;
}

function isKeyValue(statement: TomlStatement): boolean {
	return statement.kind === TomlStatementKind.KeyValue;
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && isPrefix(left, right);
}

function isStrictPrefix(prefix: readonly string[], path: readonly string[]): boolean {
	return prefix.length < path.length && isPrefix(prefix, path);
}
