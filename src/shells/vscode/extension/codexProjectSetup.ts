import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as vscode from 'vscode';
import { AssistantConfigFormat } from './assistantClients';
import { isConfigurationTable, parseAssistantConfiguration } from './assistantConfig';
import { readAssistantConfiguration, updateAssistantConfiguration } from './assistantRegistration';
import { TomlEditor } from './toml/tomlEditor';

const CodexConfiguration = {
	Directory: '.codex',
	File: 'config.toml',
	HomeEnvironment: 'CODEX_HOME',
} as const;
const ProjectPermission = { Trusted: 'trusted', Untrusted: 'untrusted' } as const;
const CodexSetting = { Projects: 'projects', TrustLevel: 'trust_level' } as const;
type ProjectPermission = (typeof ProjectPermission)[keyof typeof ProjectPermission];
const ALLOW_PROJECT_ACTION = 'Allow for This Project';
const PERMISSION_MESSAGE = 'Allow Codex to use this project’s settings?';

/** Permission is a separate user decision from registering an individual MCP server. */
export class CodexProjectSetup {
	async prepare(folder: vscode.WorkspaceFolder): Promise<boolean> {
		const file = codexUserConfiguration();
		const path = await realpath(folder.uri.fsPath);
		const paths = [...new Set([path, folder.uri.fsPath])];
		const source = await readAssistantConfiguration(file);
		const permissions = paths.map((project) => projectPermission(source, project));
		if (permissions.includes(ProjectPermission.Trusted) && !permissions.includes(ProjectPermission.Untrusted)) {
			if (!permissions.every((permission) => permission === ProjectPermission.Trusted))
				await updateAssistantConfiguration(file, (current) => allowProjects(current, paths));
			return true;
		}
		const allowed = await vscode.window.showInformationMessage(
			PERMISSION_MESSAGE,
			{
				modal: true,
				detail: `Project: ${path}\n\nCodex needs this permission to load the image editor connection. It also allows Codex to load this project’s other settings, including MCP servers, hooks and rules.`,
			},
			ALLOW_PROJECT_ACTION,
		);
		if (allowed !== ALLOW_PROJECT_ACTION) return false;
		await updateAssistantConfiguration(file, (current) => allowProjects(current, paths));
		return true;
	}
}

function codexUserConfiguration(): vscode.Uri {
	const customHome = process.env[CodexConfiguration.HomeEnvironment]?.trim();
	const directory = customHome ? resolve(customHome) : join(homedir(), CodexConfiguration.Directory);
	return vscode.Uri.file(join(directory, CodexConfiguration.File));
}

function projectConfiguration(source: string | undefined): {
	config: Record<string, unknown>;
	projects: Record<string, unknown>;
} {
	const config = parseAssistantConfiguration(source ?? '', AssistantConfigFormat.Toml, 'Codex user configuration');
	const projects = config.projects;
	if (projects !== undefined && !isConfigurationTable(projects)) throw new Error('Codex user configuration must contain a projects table.');
	return { config, projects: projects ?? {} };
}

function projectEntry(projects: Record<string, unknown>, path: string): Record<string, unknown> {
	const entry = projects[path];
	if (entry !== undefined && !isConfigurationTable(entry)) throw new Error('The Codex project settings must be a table.');
	return entry ?? {};
}

function projectPermission(source: string | undefined, path: string): ProjectPermission | undefined {
	const { projects } = projectConfiguration(source);
	const permission = projectEntry(projects, path).trust_level;
	if (permission !== undefined && permission !== ProjectPermission.Trusted && permission !== ProjectPermission.Untrusted)
		throw new Error('The Codex project permission must be trusted or untrusted.');
	return permission;
}

/** Marks the projects trusted, changing only their permission lines in the user's Codex settings. */
function allowProjects(source: string | undefined, paths: readonly string[]): string {
	const editor = new TomlEditor(source ?? '');
	for (const path of paths) {
		projectPermission(source, path);
		editor.set([CodexSetting.Projects, path, CodexSetting.TrustLevel], ProjectPermission.Trusted);
	}
	return editor.text;
}

