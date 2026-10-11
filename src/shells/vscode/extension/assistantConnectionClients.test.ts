import type * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantClient } from './assistantClients';

const mock = vi.hoisted(() => ({
	files: new Map<string, Uint8Array>(),
	state: new Map<string, unknown>(),
	secrets: new Map<string, string>(),
	start: vi.fn(),
	close: vi.fn(),
	info: vi.fn(),
	error: vi.fn(),
	warning: vi.fn(),
	readFailure: undefined as Error | undefined,
	writeFailure: undefined as Error | undefined,
}));

vi.mock('vscode', () => ({
	Uri: { joinPath: (base: { path: string }, ...parts: string[]) => ({ path: [base.path, ...parts].join('/') }) },
	workspace: {
		workspaceFolders: [{ name: 'Project', uri: { path: '/project', fsPath: '/project' } }],
		fs: {
			readFile: async (uri: { path: string }) => {
				if (mock.readFailure) throw mock.readFailure;
				const file = mock.files.get(uri.path);
				if (!file) throw Object.assign(new Error('Missing file'), { code: 'FileNotFound' });
				return file;
			},
			createDirectory: async () => undefined,
			writeFile: async (uri: { path: string }, contents: Uint8Array) => {
				if (mock.writeFailure) throw mock.writeFailure;
				mock.files.set(uri.path, contents);
			},
		},
	},
	window: { showInformationMessage: mock.info, showErrorMessage: mock.error, showWarningMessage: mock.warning },
}));
vi.mock('../assistant/assistantServer', () => ({ startAssistantServer: mock.start }));

import { AssistantConnection } from './assistantConnection';

const Url = 'http://127.0.0.1:47348/mcp';
const ClientsKey = 'littleImageEditor.assistant.clients';
const LegacyKey = 'littleImageEditor.assistant.connected';
const ConfigPath = { Codex: '/project/.codex/config.toml', Claude: '/project/.mcp.json' } as const;
const images = { list: () => [], view: async () => { throw new Error('Unused'); } };

beforeEach(() => {
	vi.clearAllMocks();
	mock.files.clear(); mock.state.clear(); mock.secrets.clear();
	mock.readFailure = undefined; mock.writeFailure = undefined;
	mock.close.mockResolvedValue(undefined);
	mock.start.mockResolvedValue({ url: Url, close: mock.close });
});

describe('shared assistant connections', () => {
	it('connects both clients to one server and disconnects them independently', async () => {
		const connection = createConnection();
		await connection.connect(AssistantClient.ClaudeCode);
		await connection.connect(AssistantClient.Codex);
		expect(mock.start).toHaveBeenCalledTimes(1);
		expect(mock.close).not.toHaveBeenCalled();
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.ClaudeCode, AssistantClient.Codex]);
		for (const path of Object.values(ConfigPath)) expect(read(path)).toContain(Url);
		await connection.disconnect(AssistantClient.Codex);
		expect(mock.close).not.toHaveBeenCalled();
		expect(read(ConfigPath.Codex)).not.toContain(Url);
		expect(read(ConfigPath.Claude)).toContain(Url);
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.ClaudeCode]);
		await connection.disconnect(AssistantClient.ClaudeCode);
		expect(mock.close).toHaveBeenCalledTimes(1);
		expect(mock.state.get(ClientsKey)).toEqual([]);
	});

	it('serializes simultaneous connections and reuses the stored token', async () => {
		const connection = createConnection();
		await Promise.all([connection.connect(AssistantClient.Codex), connection.connect(AssistantClient.ClaudeCode), connection.connect(AssistantClient.Codex)]);
		expect(mock.start).toHaveBeenCalledTimes(1);
		expect(mock.secrets.size).toBe(1);
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.Codex, AssistantClient.ClaudeCode]);
		const token = [...mock.secrets.values()][0]!;
		for (const path of Object.values(ConfigPath)) expect(read(path)).toContain(token);
		await connection.disconnect(AssistantClient.ClaudeCode);
		expect(mock.close).not.toHaveBeenCalled();
		expect(read(ConfigPath.Codex)).toContain(Url);
		await connection.disconnect(AssistantClient.Codex);
	});

	it('restores legacy Claude-only connection state and can subsequently add Codex', async () => {
		mock.state.set(LegacyKey, true);
		const connection = createConnection();
		await connection.resume();
		expect(read(ConfigPath.Claude)).toContain(Url);
		await connection.connect(AssistantClient.Codex);
		expect(mock.start).toHaveBeenCalledTimes(1);
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.ClaudeCode, AssistantClient.Codex]);
		await connection.disconnect(AssistantClient.Codex);
		await connection.disconnect(AssistantClient.ClaudeCode);
		await createConnection().resume();
		expect(mock.start).toHaveBeenCalledTimes(1);
	});

	it('refreshes both registrations after restarting on a different port', async () => {
		const connection = createConnection();
		await connection.connect(AssistantClient.Codex);
		await connection.connect(AssistantClient.ClaudeCode);
		await connection.disconnect(AssistantClient.Codex);
		await connection.connect(AssistantClient.Codex);
		const nextUrl = 'http://127.0.0.1:47349/mcp';
		mock.start.mockResolvedValue({ url: nextUrl, close: mock.close });
		await createConnection().resume();
		for (const path of Object.values(ConfigPath)) {
			expect(read(path)).toContain(nextUrl);
			expect(read(path)).not.toContain(Url);
		}
	});

	it('leaves Claude connected when Codex configuration is malformed', async () => {
		const connection = createConnection();
		await connection.connect(AssistantClient.ClaudeCode);
		const malformed = 'model = "unterminated';
		mock.files.set(ConfigPath.Codex, new TextEncoder().encode(malformed));
		await connection.connect(AssistantClient.Codex);
		expect(mock.close).not.toHaveBeenCalled();
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.ClaudeCode]);
		expect(read(ConfigPath.Codex)).toBe(malformed);
		expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('not valid TOML'));
		await connection.disconnect(AssistantClient.ClaudeCode);
	});

	it('restores Claude even when another remembered client has invalid configuration', async () => {
		mock.state.set(ClientsKey, [AssistantClient.Codex, AssistantClient.ClaudeCode]);
		mock.files.set(ConfigPath.Codex, new TextEncoder().encode('model = "unterminated'));
		const connection = createConnection();
		await connection.resume();
		expect(read(ConfigPath.Claude)).toContain(Url);
		expect(mock.close).not.toHaveBeenCalled();
		expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('restore the Codex connection'));
	});

	it('does not overwrite inaccessible configuration or remember a failed connection', async () => {
		mock.readFailure = new Error('Permission denied');
		await createConnection().connect(AssistantClient.Codex);
		expect(mock.state.has(ClientsKey)).toBe(false);
		expect(mock.files.size).toBe(0);
		expect(mock.close).toHaveBeenCalledTimes(1);
		expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
	});

	it('keeps the existing connection active if disconnect cannot update its configuration', async () => {
		const connection = createConnection();
		await connection.connect(AssistantClient.Codex);
		mock.writeFailure = new Error('Permission denied');
		await connection.disconnect(AssistantClient.Codex);
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.Codex]);
		expect(mock.close).not.toHaveBeenCalled();
		expect(read(ConfigPath.Codex)).toContain(Url);
		mock.writeFailure = undefined;
		await connection.disconnect(AssistantClient.Codex);
	});
});

function read(path: string): string {
	return new TextDecoder().decode(mock.files.get(path));
}

function createConnection(): AssistantConnection {
	const context = {
		workspaceState: {
			get: (key: string, fallback?: unknown) => mock.state.get(key) ?? fallback,
			update: async (key: string, value: unknown) => { mock.state.set(key, value); },
		},
		secrets: {
			get: async (key: string) => mock.secrets.get(key),
			store: async (key: string, value: string) => { mock.secrets.set(key, value); },
		},
		extension: { packageJSON: { version: '0.3.1' } },
	} as unknown as vscode.ExtensionContext;
	const log = { appendLine: vi.fn() } as unknown as vscode.OutputChannel;
	return new AssistantConnection(context, images, log);
}
