/** Assistants sharing the editor's MCP server; only their configuration differs. */
export const AssistantClient = {
	ClaudeCode: 'claudeCode',
	Codex: 'codex',
} as const;
export type AssistantClient =
	(typeof AssistantClient)[keyof typeof AssistantClient];

/** Must match `contributes.commands[].command` in the extension manifest. */
export const AssistantCommand = {
	Connect: 'littleImageEditor.connectAssistant',
	Disconnect: 'littleImageEditor.disconnectAssistant',
	ConnectCodex: 'littleImageEditor.connectCodex',
	DisconnectCodex: 'littleImageEditor.disconnectCodex',
} as const;
type AssistantCommand =
	(typeof AssistantCommand)[keyof typeof AssistantCommand];

export const AssistantConfigFormat = { Json: 'json', Toml: 'toml' } as const;
export type AssistantConfigFormat =
	(typeof AssistantConfigFormat)[keyof typeof AssistantConfigFormat];
export const ASSISTANT_SERVER_NAME = 'little-image-editor';

export interface AssistantClientDefinition {
	readonly label: string;
	readonly configPath: readonly string[];
	readonly configFormat: AssistantConfigFormat;
	readonly serverTable: string;
	readonly connectCommand: AssistantCommand;
	readonly disconnectCommand: AssistantCommand;
	readonly reconnectHelp: string;
}

export const ASSISTANT_CLIENTS = {
	[AssistantClient.ClaudeCode]: {
		label: 'Claude Code',
		configPath: ['.mcp.json'],
		configFormat: AssistantConfigFormat.Json,
		serverTable: 'mcpServers',
		connectCommand: AssistantCommand.Connect,
		disconnectCommand: AssistantCommand.Disconnect,
		reconnectHelp:
			'Start a new Claude Code session in this project and approve the server when asked.',
	},
	[AssistantClient.Codex]: {
		label: 'Codex',
		configPath: ['.codex', 'config.toml'],
		configFormat: AssistantConfigFormat.Toml,
		serverTable: 'mcp_servers',
		connectCommand: AssistantCommand.ConnectCodex,
		disconnectCommand: AssistantCommand.DisconnectCodex,
		reconnectHelp:
			'Run Developer: Reload Window, then start a new Codex chat to load its MCP tools. For the CLI, start a new session in this project.',
	},
} as const satisfies Record<AssistantClient, AssistantClientDefinition>;

export function isAssistantClient(value: unknown): value is AssistantClient {
	return Object.values(AssistantClient).some((client) => client === value);
}
