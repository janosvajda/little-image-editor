import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createImageToolServer, type ImageToolsIdentity } from './imageTools';
import { HttpStatus, hasBearerToken, LOOPBACK_HOST, listenOnLoopback, loopbackHosts, requestPath } from './loopbackHttp';
import type { OpenImages } from './openImages';

export const ASSISTANT_PATH = '/mcp';

export interface AssistantServerOptions {
	/** 0 picks a free port, as tests do. */
	readonly port: number;
	/** Every request must carry it as a bearer token. */
	readonly token: string;
	readonly images: OpenImages;
	readonly identity: ImageToolsIdentity;
}

export interface RunningAssistantServer {
	readonly url: string;
	close(): Promise<void>;
}

/**
 * Serves the image tools to an assistant's MCP client over Streamable HTTP.
 * The developer-run MCP server uses it for clients that connect by address;
 * the extension itself never serves MCP. Each request gets its own short-lived
 * server, so no session state is kept; requests from web pages are refused,
 * as their Host header names another site.
 */
export async function startAssistantServer(options: AssistantServerOptions): Promise<RunningAssistantServer> {
	const http = await listenOnLoopback(options.port, (request, response, port) => handle(request, response, options, port));
	return { url: `http://${LOOPBACK_HOST}:${http.port}${ASSISTANT_PATH}`, close: () => http.close() };
}

async function handle(
	request: IncomingMessage,
	response: ServerResponse,
	options: AssistantServerOptions,
	port: number,
): Promise<void> {
	if (requestPath(request) !== ASSISTANT_PATH) {
		response.writeHead(HttpStatus.NotFound).end();
		return;
	}
	if (!hasBearerToken(request, options.token)) {
		response.writeHead(HttpStatus.Unauthorized).end();
		return;
	}
	const server = createImageToolServer(options.images, options.identity);
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		enableDnsRebindingProtection: true,
		allowedHosts: [...loopbackHosts(port)],
	});
	response.on('close', () => {
		void transport.close();
		void server.close();
	});
	await server.connect(transport);
	await transport.handleRequest(request, response);
}
