import {
	ASSISTANT_CLIENTS,
	ASSISTANT_SERVER_NAME,
	type AssistantClient,
	AssistantConfigFormat,
} from './assistantClients';
import { TomlEditor } from './toml/tomlEditor';
import { parseToml } from './toml/tomlParser';

export interface AssistantServerConnection {
	readonly url: string;
	readonly token: string;
}

const JSON_INDENT = 2;
const BEARER_PREFIX = 'Bearer ';

/** Settings of an older, program-based registration that would clash with the HTTP connection. */
const STALE_SERVER_SETTINGS = [
	'command',
	'args',
	'env',
	'env_vars',
	'cwd',
	'bearer_token_env_var',
	'http_headers_helper',
	'env_http_headers',
] as const;
const ENABLED_SETTING = 'enabled';

/** Changes this server's entry while keeping the client's other settings and servers. */
export function updateAssistantConfig(
	client: AssistantClient,
	source: string | undefined,
	connection: AssistantServerConnection | null,
): string | undefined {
	if (source === undefined && connection === null) return undefined;
	const definition = ASSISTANT_CLIENTS[client];
	const config = parseAssistantConfiguration(
		source ?? '',
		definition.configFormat,
		definition.configPath.join('/'),
	);
	const existing = config[definition.serverTable];
	if (existing !== undefined && !isConfigurationTable(existing))
		throw new Error(
			`${definition.configPath.join('/')} must contain a ${definition.serverTable} table.`,
		);
	const servers = existing ?? {};
	if (connection === null && !Object.hasOwn(servers, ASSISTANT_SERVER_NAME))
		return source;
	if (definition.configFormat === AssistantConfigFormat.Toml)
		return updateTomlServer(source ?? '', definition.serverTable, connection);
	const { [ASSISTANT_SERVER_NAME]: previous, ...others } = servers;
	const updated = {
		...config,
		[definition.serverTable]: connection
			? { ...others, [ASSISTANT_SERVER_NAME]: jsonServerEntry(connection, previous) }
			: others,
	};
	return `${JSON.stringify(updated, null, JSON_INDENT)}\n`;
}

/**
 * Edits only this server's TOML table, so comments, formatting and every
 * other setting stay as written; an unchanged connection leaves the text as it is.
 */
function updateTomlServer(
	source: string,
	serverTable: string,
	connection: AssistantServerConnection | null,
): string {
	const editor = new TomlEditor(source);
	const server = [serverTable, ASSISTANT_SERVER_NAME];
	if (!connection) {
		editor.remove(server);
		// Only the editor's entry goes; the servers table stays, as the client had it.
		if (editor.get([serverTable]) === undefined) editor.set([serverTable], {});
		return editor.text;
	}
	const previous = editor.get(server);
	const settings = isConfigurationTable(previous) ? previous : {};
	for (const setting of STALE_SERVER_SETTINGS)
		if (Object.hasOwn(settings, setting)) editor.remove([...server, setting]);
	if (settings.url !== connection.url) editor.set([...server, 'url'], connection.url);
	const headers = isConfigurationTable(settings.http_headers) ? settings.http_headers : {};
	const authorization = `${BEARER_PREFIX}${connection.token}`;
	if (headers.Authorization !== authorization)
		editor.set([...server, 'http_headers'], { ...(headers as Record<string, string>), Authorization: authorization });
	if (settings[ENABLED_SETTING] === false) editor.set([...server, ENABLED_SETTING], true);
	return editor.text;
}

/** Parses a client configuration without accepting malformed tables or losing its contents. */
export function parseAssistantConfiguration(
	source: string,
	format: AssistantConfigFormat,
	path: string,
): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed =
			format === AssistantConfigFormat.Toml
				? parseToml(source).value
				: JSON.parse(source || '{}');
	} catch {
		throw new Error(
			`${path} is not valid ${format.toUpperCase()}; its contents have been left unchanged.`,
		);
	}
	if (!isConfigurationTable(parsed))
		throw new Error(`${path} must contain a configuration object.`);
	return parsed;
}

function jsonServerEntry(
	connection: AssistantServerConnection,
	previous: unknown,
): Record<string, unknown> {
	const settings = isConfigurationTable(previous) ? { ...previous } : {};
	for (const setting of STALE_SERVER_SETTINGS) delete settings[setting];
	const headers = {
		...(isConfigurationTable(settings.headers) ? settings.headers : {}),
		Authorization: `${BEARER_PREFIX}${connection.token}`,
	};
	return { ...settings, type: 'http', url: connection.url, headers };
}

export function isConfigurationTable(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
