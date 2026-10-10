import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { assistantPortsFor } from '../assistant/assistantPort';
import { type RunningAssistantServer, startAssistantServer } from '../assistant/assistantServer';
import type { OpenImages } from '../assistant/openImages';

/** Must match `contributes.commands[].command` in the extension manifest. */
export const AssistantCommand = {
	Connect: 'littleImageEditor.connectAssistant',
	Disconnect: 'littleImageEditor.disconnectAssistant',
} as const;
/** The extension's output channel, where the assistant server reports what it does. */
export const OUTPUT_NAME = 'Little Image Editor';
/** Remembered per project, so only the windows of connected projects run a server. */
const CONNECTED_STATE_KEY = 'littleImageEditor.assistant.connected';
/** The name assistants know the server by, in `.mcp.json` and in their tool lists. */
const SERVER_NAME = 'little-image-editor';
const FALLBACK_VERSION = '0.0.0';
const TOKEN_SECRET_KEY = 'littleImageEditor.assistant.token';
const TOKEN_BYTES = 32;
const HEX = 'hex';
const MCP_CONFIG_FILE = '.mcp.json';
const JSON_INDENT = 2;
const ADDRESS_IN_USE = 'EADDRINUSE';

/** The part of Claude Code's `.mcp.json` this extension reads and writes. */
interface McpConfig {
	mcpServers?: Record<string, unknown>;
}

/**
 * Lets an AI assistant such as Claude Code see the images open in this
 * window through an MCP server on this computer. It is off until the user
 * connects the project; the server then has the project's own port, and
 * answers only requests that carry a token kept in VS Code's secret storage.
 */
export class AssistantConnection implements vscode.Disposable {
	#server: RunningAssistantServer | null = null;
	/** Starts and stops run one after another, so two never race for a port. */
	#work: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly images: OpenImages,
		private readonly log: vscode.OutputChannel,
	) {}

	/** Serves the project again when it was connected before, as after VS Code restarts. */
	resume(): Promise<void> {
		return this.queue(async () => {
			const folder = projectFolder();
			if (folder && this.isConnected()) await this.serve(folder);
		});
	}

	/** Serves this window's project and registers the server for Claude Code there. */
	connect(): Promise<void> {
		return this.queue(async () => {
			const folder = projectFolder();
			if (!folder) {
				void vscode.window.showWarningMessage(
					'Open a project folder in VS Code first; Claude Code connects to the images of the project it works in.',
				);
				return;
			}
			await this.context.workspaceState.update(CONNECTED_STATE_KEY, true);
			try {
				await this.serve(folder);
			} catch (error) {
				void vscode.window.showErrorMessage(
					`Little Image Editor could not connect to Claude Code: ${describe(error)}. The "${OUTPUT_NAME}" output has the details.`,
				);
				return;
			}
			void vscode.window.showInformationMessage(
				`Connected. Start a new Claude Code session in ${folder.name} and approve the "${SERVER_NAME}" server when asked. ${MCP_CONFIG_FILE} now holds this computer's private key for it, so keep it out of version control.`,
			);
		});
	}

	/** Stops serving this project and removes the server from its `.mcp.json`. */
	disconnect(): Promise<void> {
		return this.queue(async () => {
			await this.context.workspaceState.update(CONNECTED_STATE_KEY, false);
			await this.stop();
			const folder = projectFolder();
			if (folder) await unregister(folder.uri);
			void vscode.window.showInformationMessage('Little Image Editor is disconnected from Claude Code.');
		});
	}

	dispose(): void {
		void this.queue(() => this.stop());
	}

	private queue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.#work.then(task, task);
		this.#work = run.catch((error: unknown) => this.log.appendLine(describe(error)));
		return run;
	}

	private isConnected(): boolean {
		return this.context.workspaceState.get<boolean>(CONNECTED_STATE_KEY, false);
	}

	/** Starts the server on the project's port and points the project's `.mcp.json` at it. */
	private async serve(folder: vscode.WorkspaceFolder): Promise<void> {
		await this.stop();
		const token = await this.token();
		this.#server = await this.listen(folder, token);
		this.log.appendLine(`Assistant server for ${folder.name} listening at ${this.#server.url}`);
		await register(folder.uri, this.#server.url, token);
	}

	/** Listens on the folder's own port, or the next free one when another program has it. */
	private async listen(folder: vscode.WorkspaceFolder, token: string): Promise<RunningAssistantServer> {
		const identity = { name: SERVER_NAME, version: this.version() };
		let lastError: unknown;
		for (const port of assistantPortsFor(folder.uri.fsPath)) {
			try {
				return await startAssistantServer({ port, token, images: this.images, identity });
			} catch (error) {
				if (!isAddressInUse(error)) throw error;
				this.log.appendLine(`Port ${port} is in use; trying the next one.`);
				lastError = error;
			}
		}
		throw lastError;
	}

	private async stop(): Promise<void> {
		await this.#server?.close();
		this.#server = null;
	}

	private async token(): Promise<string> {
		const stored = await this.context.secrets.get(TOKEN_SECRET_KEY);
		if (stored) return stored;
		const created = randomBytes(TOKEN_BYTES).toString(HEX);
		await this.context.secrets.store(TOKEN_SECRET_KEY, created);
		return created;
	}

	private version(): string {
		const { version } = this.context.extension.packageJSON as { version?: unknown };
		return typeof version === 'string' ? version : FALLBACK_VERSION;
	}
}

/** The project Claude Code works in: the window's first folder. */
function projectFolder(): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.workspaceFolders?.[0];
}

/**
 * Adds the server, with its token, to the project's `.mcp.json`. The token
 * is written out because a header command runs in Claude Code only for
 * projects trusted in its terminal, which its VS Code panel cannot do; the
 * file belongs to this computer and is kept out of version control.
 */
async function register(folder: vscode.Uri, url: string, token: string): Promise<void> {
	const file = vscode.Uri.joinPath(folder, MCP_CONFIG_FILE);
	const config = await readMcpConfig(file);
	const entry = { type: 'http', url, headers: { Authorization: `Bearer ${token}` } };
	if (JSON.stringify(config.mcpServers?.[SERVER_NAME]) === JSON.stringify(entry)) return;
	config.mcpServers = { ...config.mcpServers, [SERVER_NAME]: entry };
	await writeMcpConfig(file, config);
}

async function unregister(folder: vscode.Uri): Promise<void> {
	const file = vscode.Uri.joinPath(folder, MCP_CONFIG_FILE);
	const config = await readMcpConfig(file);
	if (!config.mcpServers || !(SERVER_NAME in config.mcpServers)) return;
	const { [SERVER_NAME]: _removed, ...others } = config.mcpServers;
	config.mcpServers = others;
	await writeMcpConfig(file, config);
}

async function readMcpConfig(file: vscode.Uri): Promise<McpConfig> {
	let text: string;
	try {
		text = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
	} catch {
		return {};
	}
	const parsed: unknown = JSON.parse(text);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		throw new Error(`${MCP_CONFIG_FILE} does not hold a JSON object.`);
	return parsed as McpConfig;
}

async function writeMcpConfig(file: vscode.Uri, config: McpConfig): Promise<void> {
	await vscode.workspace.fs.writeFile(
		file,
		new TextEncoder().encode(`${JSON.stringify(config, null, JSON_INDENT)}\n`),
	);
}

function isAddressInUse(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === ADDRESS_IN_USE;
}

function describe(error: unknown): string {
	if (isAddressInUse(error)) return 'every port it can use is taken by another program';
	return error instanceof Error ? error.message : String(error);
}
