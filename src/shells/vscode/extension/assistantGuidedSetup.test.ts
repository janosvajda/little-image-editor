import { parseToml } from './toml/tomlParser';
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantClient } from './assistantClients';

const parse = (source: string) => parseToml(source).value;

const mock = vi.hoisted(() => ({
	files: new Map<string, Uint8Array>(),
	state: new Map<string, unknown>(),
	secrets: new Map<string, string>(),
	folders: [] as vscode.WorkspaceFolder[],
	permission: vi.fn(),
	info: vi.fn(),
	error: vi.fn(),
	warning: vi.fn(),
	write: vi.fn(),
	start: vi.fn(),
	close: vi.fn(),
	readFailure: undefined as string | undefined,
	writeFailure: undefined as string | undefined,
}));

vi.mock('vscode', async () => {
	const { join } = await import('node:path');
	const file = (path: string) => ({ path, fsPath: path, scheme: 'file', toString: () => `file://${path}` });
	return {
		Uri: { file, joinPath: (base: { fsPath: string }, ...parts: string[]) => file(join(base.fsPath, ...parts)) },
		workspace: {
			get workspaceFolders() { return mock.folders; },
			fs: {
				readFile: async (uri: { fsPath: string }) => {
					if (mock.readFailure === uri.fsPath) throw new Error('Permission denied');
					const contents = mock.files.get(uri.fsPath);
					if (!contents) throw Object.assign(new Error('Missing file'), { code: 'FileNotFound' });
					return contents;
				},
				createDirectory: async () => undefined,
				writeFile: async (uri: { fsPath: string }, contents: Uint8Array) => {
					if (mock.writeFailure === uri.fsPath) throw new Error('Permission denied');
					mock.write(uri.fsPath);
					mock.files.set(uri.fsPath, contents);
				},
			},
		},
		window: {
			showInformationMessage: (message: string, options?: vscode.MessageOptions, ...actions: string[]) =>
				options?.modal ? mock.permission(message, options, ...actions) : mock.info(message),
			showErrorMessage: mock.error,
			showWarningMessage: mock.warning,
		},
	};
});
vi.mock('../assistant/assistantServer', () => ({ startAssistantServer: mock.start }));

import { AssistantConnection } from './assistantConnection';
import { AssistantSetupController } from './assistantSetupController';

const AllowAction = 'Allow for This Project';
const ClientsKey = 'littleImageEditor.assistant.clients';
const CodexHomeEnvironment = 'CODEX_HOME';
const customHome = process.env[CodexHomeEnvironment]?.trim();
const CodexConfig = join(customHome ? resolve(customHome) : join(homedir(), '.codex'), 'config.toml');
let temporary: string;
let project: string;

beforeEach(async () => {
	vi.clearAllMocks();
	mock.files.clear(); mock.state.clear(); mock.secrets.clear();
	mock.readFailure = undefined; mock.writeFailure = undefined;
	mock.permission.mockResolvedValue(AllowAction);
	mock.close.mockResolvedValue(undefined);
	mock.start.mockResolvedValue({ url: 'http://127.0.0.1:47348/mcp', close: mock.close });
	temporary = await mkdtemp(join(tmpdir(), 'little-editor-guided-setup-'));
	project = await realpath(temporary);
	mock.folders = [folder(project)];
});
afterEach(async () => rm(temporary, { recursive: true, force: true }));

function folder(path: string): vscode.WorkspaceFolder {
	return { name: 'Project', index: 0, uri: { fsPath: path } as vscode.Uri };
}

function source(path: string): string | undefined {
	const contents = mock.files.get(path);
	return contents ? new TextDecoder().decode(contents) : undefined;
}

function store(path: string, contents: string): void {
	mock.files.set(path, new TextEncoder().encode(contents));
}

function subject() {
	const context = {
		workspaceState: {
			get: (key: string, fallback?: unknown) => mock.state.get(key) ?? fallback,
			update: async (key: string, value: unknown) => { mock.state.set(key, value); },
		},
		secrets: {
			get: async (key: string) => mock.secrets.get(key),
			store: async (key: string, value: string) => { mock.secrets.set(key, value); },
		},
		extension: { packageJSON: { version: '0.3.3' } },
	} as unknown as vscode.ExtensionContext;
	const log = { appendLine: vi.fn() };
	const connection = new AssistantConnection(context, { list: () => [], view: async () => { throw new Error('Not used'); } }, log as unknown as vscode.OutputChannel);
	return { setup: new AssistantSetupController(connection, log), connection };
}

function userConfig(): ReturnType<typeof parse> {
	return parse(source(CodexConfig)!);
}

describe('guided assistant setup', () => {
	it('a connect command requests project permission and configures Codex without manual edits', async () => {
		await subject().setup.connect(AssistantClient.Codex);
		expect(mock.permission).toHaveBeenCalledExactlyOnceWith(
			'Allow Codex to use this project’s settings?',
			expect.objectContaining({ modal: true, detail: expect.stringContaining('MCP servers, hooks and rules') }),
			AllowAction,
		);
		expect(mock.write.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining([CodexConfig]));
		expect(userConfig().projects[project].trust_level).toBe('trusted');
		expect(parse(source(join(project, '.codex/config.toml'))!).mcp_servers['little-image-editor'].url).toBe('http://127.0.0.1:47348/mcp');
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.Codex]);
		expect(mock.start).toHaveBeenCalledOnce();
	});

	it('uses an already approved project without a prompt or rewriting personal settings', async () => {
		const before = `# Existing approval\n[projects.${JSON.stringify(project)}]\ntrust_level = "trusted"\n`;
		store(CodexConfig, before);
		await subject().setup.connect(AssistantClient.Codex);
		expect(mock.permission).not.toHaveBeenCalled();
		expect(source(CodexConfig)).toBe(before);
		expect(mock.write.mock.calls.map(([path]) => path)).not.toContain(CodexConfig);
		expect(mock.start).toHaveBeenCalledOnce();
	});

	it.each([undefined, 'Cancel'])('leaves the project and personal configuration alone when permission is declined: %s', async (choice) => {
		const before = `[projects.${JSON.stringify(project)}]\ntrust_level = "untrusted"\n`;
		store(CodexConfig, before);
		mock.permission.mockResolvedValue(choice);
		await subject().setup.connect(AssistantClient.Codex);
		expect(source(CodexConfig)).toBe(before);
		expect(mock.files.size).toBe(1);
		expect(mock.write).not.toHaveBeenCalled();
		expect(mock.start).not.toHaveBeenCalled();
		expect(mock.state.size).toBe(0);
		expect(mock.secrets.size).toBe(0);
	});

	it('preserves comments, other projects and existing project options when permission is granted', async () => {
		store(CodexConfig, `# Personal settings\nmodel = "existing-model"\n\n[projects."/another-project"]\ntrust_level = "untrusted"\n\n# This project\n[projects.${JSON.stringify(project)}]\ntrust_level = "untrusted" # Ask before changing this\ncustom_option = "keep"\n\n[mcp_servers.other]\nurl = "https://example.test/mcp"\n`);
		await subject().setup.connect(AssistantClient.Codex);
		const config = userConfig();
		expect(config.model).toBe('existing-model');
		expect(config.projects['/another-project'].trust_level).toBe('untrusted');
		expect(config.projects[project]).toEqual({ trust_level: 'trusted', custom_option: 'keep' });
		expect(config.mcp_servers.other.url).toBe('https://example.test/mcp');
		expect(source(CodexConfig)).toContain('# Personal settings');
		expect(source(CodexConfig)).toContain('# Ask before changing this');
	});

	it('re-reads personal settings after the dialog so edits made while it is open are retained', async () => {
		store(CodexConfig, 'model = "before"\n');
		mock.permission.mockImplementationOnce(async () => {
			store(CodexConfig, '# Edited while waiting\nmodel = "after"\n');
			return AllowAction;
		});
		await subject().setup.connect(AssistantClient.Codex);
		expect(userConfig().model).toBe('after');
		expect(source(CodexConfig)).toContain('# Edited while waiting');
	});

	it.each([
		'model = "unterminated',
		'projects = []',
		'projects = 12',
	])('reports malformed personal settings without overwriting them: %s', async (before) => {
		store(CodexConfig, before);
		await subject().setup.connect(AssistantClient.Codex);
		expect(source(CodexConfig)).toBe(before);
		expect(mock.error).toHaveBeenCalledOnce();
		expect(mock.permission).not.toHaveBeenCalled();
		expect(mock.write).not.toHaveBeenCalled();
		expect(mock.start).not.toHaveBeenCalled();
	});

	it.each(['"invalid"', '42'])('does not replace an invalid project permission: %s', async (permission) => {
		const before = `[projects.${JSON.stringify(project)}]\ntrust_level = ${permission}\n`;
		store(CodexConfig, before);
		await subject().setup.connect(AssistantClient.Codex);
		expect(source(CodexConfig)).toBe(before);
		expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('permission must be trusted or untrusted'));
		expect(mock.permission).not.toHaveBeenCalled();
	});

	it('does not replace a project entry that is not a table', async () => {
		const before = `[projects]\n${JSON.stringify(project)} = 42\n`;
		store(CodexConfig, before);
		await subject().setup.connect(AssistantClient.Codex);
		expect(source(CodexConfig)).toBe(before);
		expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('project settings must be a table'));
		expect(mock.write).not.toHaveBeenCalled();
	});

	it.each(['read', 'write'])('reports a personal configuration %s failure and keeps Claude’s existing connection active', async (operation) => {
		const { setup } = subject();
		await setup.connect(AssistantClient.ClaudeCode);
		if (operation === 'read') mock.readFailure = CodexConfig;
		else mock.writeFailure = CodexConfig;
		await setup.connect(AssistantClient.Codex);
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.ClaudeCode]);
		expect(mock.close).not.toHaveBeenCalled();
		expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
		expect(source(join(project, '.mcp.json'))).toContain('little-image-editor');
		expect(source(join(project, '.codex/config.toml'))).toBeUndefined();
	});

	it('serializes repeated connect commands, showing one permission dialog and starting one shared server', async () => {
		const { setup } = subject();
		await Promise.all([setup.connect(AssistantClient.Codex), setup.connect(AssistantClient.Codex)]);
		expect(mock.permission).toHaveBeenCalledOnce();
		expect(mock.start).toHaveBeenCalledOnce();
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.Codex]);
	});

	it('registers Claude without accessing Codex personal settings', async () => {
		mock.readFailure = CodexConfig;
		await subject().setup.connect(AssistantClient.ClaudeCode);
		expect(mock.state.get(ClientsKey)).toEqual([AssistantClient.ClaudeCode]);
		expect(mock.permission).not.toHaveBeenCalled();
		expect(mock.error).not.toHaveBeenCalled();
		expect(mock.files.has(CodexConfig)).toBe(false);
	});

	it('does not revoke general project permission when only the editor connection is disconnected', async () => {
		const { setup, connection } = subject();
		await setup.connect(AssistantClient.Codex);
		const before = source(CodexConfig);
		await connection.disconnect(AssistantClient.Codex);
		expect(source(CodexConfig)).toBe(before);
		expect(parse(source(join(project, '.codex/config.toml'))!).mcp_servers).not.toHaveProperty('little-image-editor');
	});

	it('honours an existing permission when the workspace is reached through a symbolic link', async () => {
		const alias = `${project}-alias`;
		await symlink(project, alias);
		try {
			mock.folders = [folder(alias)];
			store(CodexConfig, `[projects.${JSON.stringify(project)}]\ntrust_level = "trusted"\n`);
			await subject().setup.connect(AssistantClient.Codex);
			expect(mock.permission).not.toHaveBeenCalled();
			expect(userConfig().projects[project].trust_level).toBe('trusted');
			expect(userConfig().projects[alias].trust_level).toBe('trusted');
		} finally {
			await rm(alias);
		}
	});

	it('asks the user to open a folder when there is no project, without editing personal settings', async () => {
		mock.folders = [];
		await subject().setup.connect(AssistantClient.Codex);
		expect(mock.warning).toHaveBeenCalledWith(expect.stringContaining('Open a project folder'));
		expect(mock.permission).not.toHaveBeenCalled();
		expect(mock.write).not.toHaveBeenCalled();
	});
});
