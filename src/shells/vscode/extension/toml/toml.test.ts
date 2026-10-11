import { describe, expect, it } from 'vitest';
import { TomlEditor, TomlEditError } from './tomlEditor';
import { formatValue, parseToml, TomlSyntaxError } from './tomlParser';

const parse = (source: string) => parseToml(source).value;

describe('reading TOML', () => {
	it('reads every kind of value', () => {
		expect(
			parse(`# comment
title = "Editor" # trailing comment
literal = 'C:\\Users\\me'
escaped = "tab\\tquote\\" é \\u00e9 \\U0001F600"
count = 1_000
hex = 0xff
octal = 0o17
binary = 0b101
negative = -12
ratio = 3.5e2
infinite = -inf
enabled = true
born = 1979-05-27T07:32:00Z
local = 1979-05-27 07:32:00
day = 1979-05-27
time = 07:32:00
list = [1, "two", [3], { four = 4 },]
nested = { inner = { deep = false } }
`),
		).toEqual({
			title: 'Editor',
			literal: 'C:\\Users\\me',
			escaped: 'tab\tquote" é é 😀',
			count: 1000,
			hex: 255,
			octal: 15,
			binary: 5,
			negative: -12,
			ratio: 350,
			infinite: -Infinity,
			enabled: true,
			born: '1979-05-27T07:32:00Z',
			local: '1979-05-27 07:32:00',
			day: '1979-05-27',
			time: '07:32:00',
			list: [1, 'two', [3], { four: 4 }],
			nested: { inner: { deep: false } },
		});
	});

	it('reads multi-line strings, keeping text that looks like tables inside them', () => {
		expect(
			parse(`basic = """
first
[not.a.table]
joined \\
   line"""
literal = '''
raw \\n text'''
quotes = """two "" quotes"""""
`),
		).toEqual({ basic: 'first\n[not.a.table]\njoined line', literal: 'raw \\n text', quotes: 'two "" quotes""' });
	});

	it('reads tables, quoted and dotted keys, and arrays of tables', () => {
		expect(
			parse(`site."google.com".rank = 1
[servers.alpha]
ip = "10.0.0.1"
[servers."beta node"]
ip = "10.0.0.2"
[[products]]
name = "Hammer"
[products.details]
weight = 2
[[products]]
name = "Nail"
[servers]
region = "eu"
`),
		).toEqual({
			site: { 'google.com': { rank: 1 } },
			servers: { alpha: { ip: '10.0.0.1' }, 'beta node': { ip: '10.0.0.2' }, region: 'eu' },
			products: [{ name: 'Hammer', details: { weight: 2 } }, { name: 'Nail' }],
		});
	});

	it.each([
		['an unterminated string', 'model = "unterminated'],
		['a key defined twice', 'a = 1\na = 2'],
		['a table defined twice', '[a]\n[a]'],
		['a value used as a table', 'a = 1\n[a.b]'],
		['an inline table extended later', 'a = { b = 1 }\n[a.c]'],
		['text after a value', 'a = 1 2'],
		['a missing value', 'a ='],
		['a bad number', 'a = 01'],
		['a bad escape', 'a = "\\x"'],
	])('refuses %s', (_, source) => {
		expect(() => parse(source)).toThrow(TomlSyntaxError);
	});

	it('writes values back as TOML that reads the same', () => {
		const value = { text: 'line\n"quoted"\u0001', list: [1, 2.5, true], table: { 'X-Key': 'v', bare_key: 'w' } };
		expect(parse(`v = ${formatValue(value)}`).v).toEqual(value);
	});
});

describe('editing TOML', () => {
	const settings = `# Personal settings
model = "gpt" # keep me

[mcp_servers.docs]
url = "https://docs.example/mcp"

[profiles.review]
effort = "high"
`;

	it('adds a table at the end and keeps every comment and other setting', () => {
		const editor = new TomlEditor(settings)
			.set(['mcp_servers', 'little-image-editor', 'url'], 'http://127.0.0.1:1/mcp')
			.set(['mcp_servers', 'little-image-editor', 'http_headers'], { Authorization: 'Bearer key' });
		expect(editor.text).toBe(
			`${settings}\n[mcp_servers.little-image-editor]\nurl = "http://127.0.0.1:1/mcp"\nhttp_headers = { Authorization = "Bearer key" }\n`,
		);
	});

	it('replaces a value in place and adds a key after the last one of its table', () => {
		const editor = new TomlEditor(settings)
			.set(['mcp_servers', 'docs', 'url'], 'https://new.example/mcp')
			.set(['mcp_servers', 'docs', 'enabled'], false)
			.set(['model'], 'other');
		expect(editor.text).toBe(
			settings
				.replace('https://docs.example/mcp', 'https://new.example/mcp')
				.replace('url = "https://new.example/mcp"\n', 'url = "https://new.example/mcp"\nenabled = false\n')
				.replace('model = "gpt"', 'model = "other"'),
		);
	});

	it('removes a table with its sub-tables and leaves the rest exactly as it was', () => {
		const withServer = `${settings}\n[mcp_servers.little-image-editor]\nurl = "x"\n[mcp_servers.little-image-editor.http_headers]\nAuthorization = "Bearer key"\n`;
		expect(new TomlEditor(withServer).remove(['mcp_servers', 'little-image-editor']).text).toBe(`${settings}\n`);
		expect(new TomlEditor(settings).remove(['missing']).text).toBe(settings);
	});

	it('changes keys inside inline tables and dotted keys where they are written', () => {
		const editor = new TomlEditor('server = { url = "a", headers = { A = "1" } }\nsite.name = "x"\n')
			.set(['server', 'headers', 'B'], '2')
			.remove(['server', 'url'])
			.set(['site', 'owner'], 'me');
		expect(editor.text).toBe('server = { headers = { A = "1", B = "2" } }\nsite.name = "x"\nsite.owner = "me"\n');
	});

	it('quotes keys that need it, such as project paths', () => {
		const editor = new TomlEditor('').set(['projects', '/Users/me/My Project', 'trust_level'], 'trusted');
		expect(editor.text).toBe('[projects."/Users/me/My Project"]\ntrust_level = "trusted"\n');
		expect(new TomlEditor(editor.text).get(['projects', '/Users/me/My Project', 'trust_level'])).toBe('trusted');
	});

	it('replaces a value defined as a table with sub-tables by one inline value', () => {
		const editor = new TomlEditor('[server.headers]\nA = "1"\n').set(['server', 'headers'], { B: '2' });
		expect(editor.value).toEqual({ server: { headers: { B: '2' } } });
	});

	it('refuses a change that would not leave valid TOML, and keeps the text', () => {
		const source = '[[servers]]\nname = "a"\n';
		const editor = new TomlEditor(source);
		expect(() => editor.set(['servers', 'name'], 'b')).toThrow(TomlEditError);
		expect(editor.text).toBe(source);
	});
});
