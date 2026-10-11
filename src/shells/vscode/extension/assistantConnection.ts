import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { assistantPortsFor } from '../assistant/assistantPort';
import {
	type RunningAssistantServer,
	startAssistantServer,
} from '../assistant/assistantServer';
import type { OpenImages } from '../assistant/openImages';
import {
	ASSISTANT_CLIENTS,
	ASSISTANT_SERVER_NAME,
	AssistantClient,
	isAssistantClient,
} from './assistantClients';
import { registerAssistant } from './assistantRegistration';

/** The extension's output channel, where the assistant server reports what it does. */
export const OUTPUT_NAME = 'Little Image Editor';
/** Remembered per project, so only the windows of connected projects run a server. */
const CONNECTED_STATE_KEY = 'littleImageEditor.assistant.connected';
const CONNECTED_CLIENTS_KEY = 'littleImageEditor.assistant.clients';
const FALLBACK_VERSION = '0.0.0';
const TOKEN_SECRET_KEY = 'littleImageEditor.assistant.token';
const TOKEN_BYTES = 32;
const HEX = 'hex';
const ADDRESS_IN_USE = 'EADDRINUSE';

/** A client UI may prepare its project permissions before any server or registration changes. */
export type AssistantConnectionPreparation = (folder: vscode.WorkspaceFolder) => Promise<boolean>;

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
			const clients = this.connectedClients();
			if (!folder || !clients.length) return;
			try {
				await this.serve(folder);
			} catch (error) {
				await this.stop();
				this.reportError('restore the assistant connections', error);
				return;
			}
			let registered = false;
			for (const client of clients) {
				try {
					await this.register(folder, client);
					registered = true;
				} catch (error) {
					this.reportError(
						`restore the ${ASSISTANT_CLIENTS[client].label} connection`,
						error,
					);
				}
			}
			if (!registered) await this.stop();
		});
	}

	/** Registers a client against the shared server, without restarting another client's connection. */
	connect(
		client: AssistantClient = AssistantClient.ClaudeCode,
		prepare?: AssistantConnectionPreparation,
	): Promise<void> {
		return this.queue(async () => {
			const definition = ASSISTANT_CLIENTS[client];
			const folder = projectFolder();
			if (!folder) {
				void vscode.window.showWarningMessage(
					`Open a project folder in VS Code first; ${definition.label} connects to the images of the project it works in.`,
				);
				return;
			}
			const clients = [...new Set([...this.connectedClients(), client])];
			const wasServing = this.#server !== null;
			try {
				if (prepare && !(await prepare(folder))) return;
				await this.connectProject(folder, client, clients, wasServing);
			} catch (error) {
				if (!wasServing) await this.stop();
				this.reportError(`connect to ${definition.label}`, error);
				return;
			}
			void vscode.window.showInformationMessage(
				`Connected to ${definition.label} for ${folder.name}. ${definition.reconnectHelp} ${definition.configPath.join('/')} holds this computer's private key for the server, so keep it out of version control.`,
			);
		});
	}

	private async connectProject(
		folder: vscode.WorkspaceFolder,
		client: AssistantClient,
		clients: readonly AssistantClient[],
		wasServing: boolean,
	): Promise<void> {
		if (!wasServing) await this.serve(folder);
		for (const connected of wasServing ? [client] : clients)
			await this.register(folder, connected);
		await this.context.workspaceState.update(CONNECTED_CLIENTS_KEY, clients);
	}

	/** Removes one client's registration; the server stays available to any other connected client. */
	disconnect(
		client: AssistantClient = AssistantClient.ClaudeCode,
	): Promise<void> {
		return this.queue(async () => {
			const folder = projectFolder();
			try {
				if (folder) await registerAssistant(folder.uri, client, null);
				const clients = this.connectedClients().filter(
					(connected) => connected !== client,
				);
				await this.context.workspaceState.update(
					CONNECTED_CLIENTS_KEY,
					clients,
				);
				if (!clients.length) await this.stop();
			} catch (error) {
				this.reportError(
					`disconnect from ${ASSISTANT_CLIENTS[client].label}`,
					error,
				);
				return;
			}
			void vscode.window.showInformationMessage(
				`Little Image Editor is disconnected from ${ASSISTANT_CLIENTS[client].label}.`,
			);
		});
	}

	dispose(): void {
		void this.queue(() => this.stop());
	}

	private queue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.#work.then(task, task);
		this.#work = run.catch((error: unknown) =>
			this.log.appendLine(describe(error)),
		);
		return run;
	}

	private connectedClients(): readonly AssistantClient[] {
		const saved: unknown = this.context.workspaceState.get(
			CONNECTED_CLIENTS_KEY,
		);
		if (Array.isArray(saved))
			return [...new Set(saved.filter(isAssistantClient))];
		return this.context.workspaceState.get<boolean>(CONNECTED_STATE_KEY, false)
			? [AssistantClient.ClaudeCode]
			: [];
	}

	/** Starts one project server shared by all connected clients. */
	private async serve(folder: vscode.WorkspaceFolder): Promise<void> {
		await this.stop();
		const token = await this.token();
		this.#server = await this.listen(folder, token);
		this.log.appendLine(
			`Assistant server for ${folder.name} listening at ${this.#server.url}`,
		);
	}

	private async register(
		folder: vscode.WorkspaceFolder,
		client: AssistantClient,
	): Promise<void> {
		if (!this.#server) throw new Error('The assistant server is not running.');
		await registerAssistant(folder.uri, client, {
			url: this.#server.url,
			token: await this.token(),
		});
	}

	private reportError(action: string, error: unknown): void {
		this.log.appendLine(describe(error));
		void vscode.window.showErrorMessage(
			`Little Image Editor could not ${action}: ${describe(error)}. The "${OUTPUT_NAME}" output has the details.`,
		);
	}

	/** Listens on the folder's own port, or the next free one when another program has it. */
	private async listen(
		folder: vscode.WorkspaceFolder,
		token: string,
	): Promise<RunningAssistantServer> {
		const identity = { name: ASSISTANT_SERVER_NAME, version: this.version() };
		let lastError: unknown;
		for (const port of assistantPortsFor(folder.uri.fsPath)) {
			try {
				return await startAssistantServer({
					port,
					token,
					images: this.images,
					identity,
				});
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
		const { version } = this.context.extension.packageJSON as {
			version?: unknown;
		};
		return typeof version === 'string' ? version : FALLBACK_VERSION;
	}
}

/** The assistants' project: the window's first folder. */
function projectFolder(): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.workspaceFolders?.[0];
}

function isAddressInUse(error: unknown): boolean {
	return (
		error instanceof Error && 'code' in error && error.code === ADDRESS_IN_USE
	);
}

function describe(error: unknown): string {
	if (isAddressInUse(error))
		return 'every port it can use is taken by another program';
	return error instanceof Error ? error.message : String(error);
}
