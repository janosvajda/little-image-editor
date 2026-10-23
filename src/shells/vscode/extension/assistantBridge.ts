import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { assistantPortsFor } from '../assistant/assistantPort';
import {
	BRIDGE_ENABLED_SETTING,
	type BridgeDiscovery,
	BridgeSetting,
	bridgeDiscoveryFile,
	DiscoveryPermission,
	parseBridgeDiscovery,
} from '../assistant/bridgeProtocol';
import { type BridgeImages, type RunningBridgeServer, startBridgeServer } from '../assistant/bridgeServer';
import { FILE_SCHEME } from './editorSession';

/** The extension's output channel, where the bridge reports what it does. */
export const OUTPUT_NAME = 'Little Image Editor';
const TOKEN_SECRET_KEY = 'littleImageEditor.assistant.token';
const TOKEN_BYTES = 32;
const HEX = 'hex';
const ADDRESS_IN_USE = 'EADDRINUSE';
const UTF8 = 'utf8';

/**
 * Lets an MCP server that a developer runs (docs/mcp-server.md) reach the
 * images open in this window. The extension serves no MCP itself: the bridge
 * answers plain JSON requests, only on this computer, only with the token
 * kept in VS Code's secret storage, and only while its setting is on.
 */
/** A running bridge and where it told MCP servers about itself. */
interface PublishedBridge {
	readonly server: RunningBridgeServer;
	readonly folder: string;
	readonly discoveryFile: string;
}

export class AssistantBridge implements vscode.Disposable {
	#published: PublishedBridge | null = null;
	/** Starts and stops run one after another, so two never race for a port. */
	#work: Promise<unknown> = Promise.resolve();
	readonly #subscriptions: vscode.Disposable[];

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly images: BridgeImages,
		private readonly log: Pick<vscode.OutputChannel, 'appendLine'>,
		/** Where discovery files go; MCP servers look in the same user's home folder. */
		private readonly home: string = homedir(),
	) {
		this.#subscriptions = [
			vscode.workspace.onDidChangeConfiguration((change) => {
				if (change.affectsConfiguration(BRIDGE_ENABLED_SETTING)) void this.sync();
			}),
			vscode.workspace.onDidChangeWorkspaceFolders(() => void this.sync()),
		];
	}

	/** Serves the project while the setting is on, and stops serving when it is turned off. */
	sync(): Promise<void> {
		return this.queue(async () => {
			const folder = enabled() ? projectFolder() : undefined;
			if (folder?.uri.fsPath === this.#published?.folder) return;
			await this.stop();
			if (!folder) return;
			try {
				await this.serve(folder);
			} catch (error) {
				await this.stop();
				this.reportError(error);
			}
		});
	}

	dispose(): void {
		for (const subscription of this.#subscriptions) subscription.dispose();
		void this.queue(() => this.stop());
	}

	private async serve(folder: vscode.WorkspaceFolder): Promise<void> {
		const token = await this.token();
		const path = folder.uri.fsPath;
		const server = await this.listen(folder, token);
		const discoveryFile = bridgeDiscoveryFile(path, this.home);
		this.#published = { server, folder: path, discoveryFile };
		const discovery: BridgeDiscovery = { url: server.url, token, folder: path, pid: process.pid };
		await mkdir(dirname(discoveryFile), { recursive: true, mode: DiscoveryPermission.Directory });
		await writeFile(discoveryFile, JSON.stringify(discovery), { mode: DiscoveryPermission.File });
		this.log.appendLine(`Assistant bridge for ${folder.name} listening at ${server.url}`);
	}

	/** Listens on the folder's own port, or the next free one when another program has it. */
	private async listen(folder: vscode.WorkspaceFolder, token: string): Promise<RunningBridgeServer> {
		let lastError: unknown;
		for (const port of assistantPortsFor(folder.uri.fsPath)) {
			try {
				return await startBridgeServer({ port, token, images: this.images });
			} catch (error) {
				if (!isAddressInUse(error)) throw error;
				this.log.appendLine(`Port ${port} is in use; trying the next one.`);
				lastError = error;
			}
		}
		throw lastError;
	}

	private async stop(): Promise<void> {
		const published = this.#published;
		if (!published) return;
		this.#published = null;
		await published.server.close();
		if (await isOwnDiscovery(published)) await rm(published.discoveryFile, { force: true });
	}

	private queue(task: () => Promise<void>): Promise<void> {
		const run = this.#work.then(task, task);
		this.#work = run.catch((error: unknown) => this.log.appendLine(describe(error)));
		return run;
	}

	private reportError(error: unknown): void {
		this.log.appendLine(describe(error));
		void vscode.window.showErrorMessage(
			`Little Image Editor could not start the assistant bridge: ${describe(error)}. The "${OUTPUT_NAME}" output has the details.`,
		);
	}

	private async token(): Promise<string> {
		const stored = await this.context.secrets.get(TOKEN_SECRET_KEY);
		if (stored) return stored;
		const created = randomBytes(TOKEN_BYTES).toString(HEX);
		await this.context.secrets.store(TOKEN_SECRET_KEY, created);
		return created;
	}
}

/** Another window may have published its own bridge for the same folder since; that file stays. */
async function isOwnDiscovery({ server, discoveryFile }: PublishedBridge): Promise<boolean> {
	try {
		return parseBridgeDiscovery(JSON.parse(await readFile(discoveryFile, UTF8))).url === server.url;
	} catch {
		return false;
	}
}

function enabled(): boolean {
	return vscode.workspace.getConfiguration(BridgeSetting.Section).get<boolean>(BridgeSetting.Enabled, false);
}

/** The bridge's project: the window's first folder on this computer, where MCP servers can read its discovery file. */
function projectFolder(): vscode.WorkspaceFolder | undefined {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder?.uri.scheme === FILE_SCHEME ? folder : undefined;
}

function isAddressInUse(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === ADDRESS_IN_USE;
}

function describe(error: unknown): string {
	if (isAddressInUse(error)) return 'every port it can use is taken by another program';
	return error instanceof Error ? error.message : String(error);
}
