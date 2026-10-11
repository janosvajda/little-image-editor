import * as vscode from 'vscode';
import { ASSISTANT_CLIENTS, type AssistantClient } from './assistantClients';
import {
	type AssistantServerConnection,
	updateAssistantConfig,
} from './assistantConfig';

const FILE_NOT_FOUND = 'FileNotFound';

/** Registers one assistant through VS Code's workspace filesystem, including remote workspaces. */
export async function registerAssistant(
	folder: vscode.Uri,
	client: AssistantClient,
	connection: AssistantServerConnection | null,
): Promise<void> {
	const path = ASSISTANT_CLIENTS[client].configPath;
	const file = vscode.Uri.joinPath(folder, ...path);
	await updateAssistantConfiguration(file, (source) => updateAssistantConfig(client, source, connection));
}

/** Re-read at update time and preserve every setting the requested transformation leaves alone. */
export async function updateAssistantConfiguration(
	file: vscode.Uri,
	update: (source: string | undefined) => string | undefined,
): Promise<void> {
	const source = await readAssistantConfiguration(file);
	const updated = update(source);
	if (updated === undefined || updated === source) return;
	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(file, '..'));
	await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(updated));
}

export async function readAssistantConfiguration(file: vscode.Uri): Promise<string | undefined> {
	try {
		return new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === FILE_NOT_FOUND
		)
			return undefined;
		throw error;
	}
}
