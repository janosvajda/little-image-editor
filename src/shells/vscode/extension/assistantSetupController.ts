import * as vscode from 'vscode';
import { ASSISTANT_CLIENTS, AssistantClient } from './assistantClients';
import { type AssistantConnection, OUTPUT_NAME } from './assistantConnection';
import { CodexProjectSetup } from './codexProjectSetup';

/** The command's setup UI runs before the shared server's connection lifecycle. */
export class AssistantSetupController {
	readonly #codex = new CodexProjectSetup();

	constructor(
		private readonly connection: Pick<AssistantConnection, 'connect'>,
		private readonly log: Pick<vscode.OutputChannel, 'appendLine'>,
	) {}

	async connect(client: AssistantClient): Promise<void> {
		try {
			await this.connection.connect(
				client,
				client === AssistantClient.Codex ? (folder) => this.#codex.prepare(folder) : undefined,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.appendLine(message);
			void vscode.window.showErrorMessage(
				`Little Image Editor could not set up ${ASSISTANT_CLIENTS[client].label}: ${message}. The "${OUTPUT_NAME}" output has the details.`,
			);
		}
	}
}
