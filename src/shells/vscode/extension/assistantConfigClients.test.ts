import { parseToml } from './toml/tomlParser';
import { describe, expect, it } from 'vitest';
import { AssistantClient, ASSISTANT_SERVER_NAME } from './assistantClients';
import { updateAssistantConfig } from './assistantConfig';

const parse = (source: string) => parseToml(source).value;

const Connection = { url: 'http://127.0.0.1:47348/mcp', token: 'test-editor-token' } as const;
const Updated = { url: 'http://127.0.0.1:47349/mcp', token: 'replacement-test-token' } as const;

describe('assistant client configuration', () => {
	it('registers the existing HTTP tools with Codex bearer authentication', () => {
		const source = updateAssistantConfig(AssistantClient.Codex, undefined, Connection)!;
		expect(parse(source)).toEqual({ mcp_servers: { [ASSISTANT_SERVER_NAME]: { url: Connection.url, http_headers: { Authorization: `Bearer ${Connection.token}` } } } });
		expect(updateAssistantConfig(AssistantClient.Codex, source, Connection)).toBe(source);
	});

	it('preserves Codex settings, comments, quoted tables and other servers when connecting and disconnecting', () => {
		const original = '# Shared project settings\nmodel = "configured-model" # Keep this comment\n\n[mcp_servers.documentation]\nurl = "https://documentation.example/mcp"\n\n[profiles.review]\nmodel_reasoning_effort = "high"\n';
		const connected = updateAssistantConfig(AssistantClient.Codex, original, Connection)!;
		expect(connected).toContain('# Shared project settings');
		expect(connected).toContain('model = "configured-model" # Keep this comment');
		expect(connected).toContain('[profiles.review]\nmodel_reasoning_effort = "high"');
		expect(parse(connected)).toMatchObject({ model: 'configured-model', mcp_servers: { documentation: { url: 'https://documentation.example/mcp' } } });
		const changed = updateAssistantConfig(AssistantClient.Codex, connected, Updated)!;
		expect(changed).not.toContain(Connection.token);
		expect(parse(changed)).toMatchObject({ mcp_servers: { [ASSISTANT_SERVER_NAME]: { url: Updated.url, http_headers: { Authorization: `Bearer ${Updated.token}` } } } });
		const disconnected = updateAssistantConfig(AssistantClient.Codex, changed, null)!;
		expect(parse(disconnected)).toEqual(parse(original));
		expect(disconnected).toContain('# Keep this comment');
		expect(disconnected).not.toContain(Updated.token);
	});

	it('handles quoted server names and inline authentication tables', () => {
		const source = '[mcp_servers."little-image-editor"]\nurl = "http://127.0.0.1:47347/mcp"\nhttp_headers = { Authorization = "Bearer old-token" }\n';
		const updated = updateAssistantConfig(AssistantClient.Codex, source, Connection)!;
		expect(parse(updated)).toEqual({ mcp_servers: { [ASSISTANT_SERVER_NAME]: { url: Connection.url, http_headers: { Authorization: `Bearer ${Connection.token}` } } } });
		expect(updated).not.toContain('old-token');
	});

	it('preserves multiline instructions containing table-looking text', () => {
		const source = 'developer_instructions = """\nDo not alter this text.\n[mcp_servers.little-image-editor]\nThis is inside a string.\n"""\n';
		const updated = updateAssistantConfig(AssistantClient.Codex, source, Connection)!;
		expect(updated).toContain(source.trim());
		expect(parse(updated)).toMatchObject(parse(source));
	});

	it('preserves server policies and extra headers while refreshing authentication and enabling Codex', () => {
		const source = '[mcp_servers.little-image-editor]\nenabled = false\nurl = "http://127.0.0.1:47347/mcp"\ntool_timeout_sec = 90\ndisabled_tools = ["remove_item"]\nhttp_headers = { Authorization = "Bearer old-token", "X-Project" = "project" }\n';
		const updated = updateAssistantConfig(AssistantClient.Codex, source, Connection)!;
		expect(parse(updated)).toMatchObject({ mcp_servers: { [ASSISTANT_SERVER_NAME]: { enabled: true, tool_timeout_sec: 90, disabled_tools: ['remove_item'], http_headers: { 'X-Project': 'project', Authorization: `Bearer ${Connection.token}` } } } });
	});

	it('retains Claude configuration and removes only the editor entry on disconnect', () => {
		const original = { preference: 'retain', mcpServers: { documentation: { type: 'http', url: 'https://documentation.example/mcp' } } };
		const connected = updateAssistantConfig(AssistantClient.ClaudeCode, JSON.stringify(original), Connection)!;
		expect(JSON.parse(connected)).toEqual({ ...original, mcpServers: { ...original.mcpServers, [ASSISTANT_SERVER_NAME]: { type: 'http', url: Connection.url, headers: { Authorization: `Bearer ${Connection.token}` } } } });
		expect(JSON.parse(updateAssistantConfig(AssistantClient.ClaudeCode, connected, null)!)).toEqual(original);
	});

	it('replaces stale command-based transport with the editor HTTP endpoint', () => {
		const source = '[mcp_servers.little-image-editor]\ncommand = "old-editor"\nargs = ["--stdio"]\nbearer_token_env_var = "OLD_EDITOR_TOKEN"\ntool_timeout_sec = 90\n';
		const updated = updateAssistantConfig(AssistantClient.Codex, source, Connection)!;
		expect(parse(updated)).toEqual({ mcp_servers: { [ASSISTANT_SERVER_NAME]: { tool_timeout_sec: 90, url: Connection.url, http_headers: { Authorization: `Bearer ${Connection.token}` } } } });
	});

	it.each(Object.values(AssistantClient))('does not create a file when disconnecting an unconfigured %s client', (client) => {
		expect(updateAssistantConfig(client, undefined, null)).toBeUndefined();
	});

	it.each([
		{ client: AssistantClient.Codex, source: 'model = "unterminated' },
		{ client: AssistantClient.Codex, source: 'mcp_servers = []' },
		{ client: AssistantClient.ClaudeCode, source: '{ invalid }' },
		{ client: AssistantClient.ClaudeCode, source: '{"mcpServers": []}' },
		{ client: AssistantClient.ClaudeCode, source: '[]' },
	])('refuses invalid configuration instead of replacing it: $client $source', ({ client, source }) => {
		expect(() => updateAssistantConfig(client, source, Connection)).toThrow();
	});
});
