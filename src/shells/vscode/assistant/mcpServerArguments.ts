import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

export const McpTransport = { Stdio: 'stdio', Http: 'http' } as const;
export type McpTransport = (typeof McpTransport)[keyof typeof McpTransport];

const TOKEN_BYTES = 32;
const HEX = 'hex';
/** 0 lets the system pick a free port. */
const ANY_PORT = 0;
export const MCP_SERVER_USAGE =
	'Usage: little-image-editor-mcp [--workspace <project folder>] [--transport stdio|http] [--port <port>] [--token <token>]';

export interface McpServerArguments {
	/** The project folder open in VS Code; the bridge it publishes is the one used. */
	readonly workspace: string;
	readonly transport: McpTransport;
	/** HTTP only. */
	readonly port: number;
	/** HTTP only; a random one when left out. */
	readonly token: string;
}

/** The developer-run MCP server's command line; the workspace defaults to the folder it starts in. */
export function parseMcpServerArguments(args: readonly string[], cwd: string): McpServerArguments {
	const { values } = parseArgs({
		args: [...args],
		options: {
			workspace: { type: 'string' },
			transport: { type: 'string', default: McpTransport.Stdio },
			port: { type: 'string' },
			token: { type: 'string' },
		},
		strict: true,
	});
	if (!isMcpTransport(values.transport)) throw new Error(MCP_SERVER_USAGE);
	const port = values.port === undefined ? ANY_PORT : Number(values.port);
	if (!Number.isInteger(port) || port < ANY_PORT) throw new Error(MCP_SERVER_USAGE);
	return {
		workspace: values.workspace ?? cwd,
		transport: values.transport,
		port,
		token: values.token || randomBytes(TOKEN_BYTES).toString(HEX),
	};
}

function isMcpTransport(value: unknown): value is McpTransport {
	return Object.values(McpTransport).some((transport) => transport === value);
}
