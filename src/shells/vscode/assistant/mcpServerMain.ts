import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startAssistantServer } from './assistantServer';
import { BridgeClient, bridgeForFolder } from './bridgeClient';
import { createImageToolServer, type ImageToolsIdentity } from './imageTools';
import { McpTransport, parseMcpServerArguments } from './mcpServerArguments';

/**
 * The Little Image Editor MCP server, run by a developer rather than by the
 * extension: it serves the image tools to an assistant and carries their
 * calls to the editor through the extension's assistant bridge.
 * See docs/mcp-server.md.
 */

/** Set by scripts/buildMcpServer.mjs to the extension version the server is built with. */
declare const LITTLE_IMAGE_EDITOR_VERSION: string;

const MCP_SERVER_NAME = 'little-image-editor';
const EXIT_FAILURE = 1;

async function main(): Promise<void> {
	const options = parseMcpServerArguments(process.argv.slice(2), process.cwd());
	const images = new BridgeClient(bridgeForFolder(options.workspace));
	const identity: ImageToolsIdentity = { name: MCP_SERVER_NAME, version: LITTLE_IMAGE_EDITOR_VERSION };
	// stdout belongs to the MCP protocol in stdio mode, so everything for people goes to stderr.
	if (options.transport === McpTransport.Stdio) {
		await createImageToolServer(images, identity).connect(new StdioServerTransport());
		return;
	}
	const server = await startAssistantServer({ port: options.port, token: options.token, images, identity });
	console.error(`Little Image Editor MCP server for ${options.workspace}\nURL: ${server.url}\nBearer token: ${options.token}`);
	const stop = () => void server.close().then(() => process.exit());
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(EXIT_FAILURE);
});
