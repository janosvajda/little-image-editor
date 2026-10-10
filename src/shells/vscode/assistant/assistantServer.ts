import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createImageToolServer, type ImageToolsIdentity } from './imageTools';
import type { OpenImages } from './openImages';

/** Only this computer can connect; the server never listens on a network address. */
export const LOOPBACK_HOST = '127.0.0.1';
const LOCALHOST_NAME = 'localhost';
export const ASSISTANT_PATH = '/mcp';
const BEARER_PREFIX = 'Bearer ';
const HttpStatus = { Unauthorized: 401, NotFound: 404 } as const;

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
 * Each request gets its own short-lived server, so no session state is kept;
 * requests from web pages are refused, as their Host header names another site.
 */
export function startAssistantServer(options: AssistantServerOptions): Promise<RunningAssistantServer> {
	const http = createServer((request, response) => void handle(request, response, options, http.address()));
	return new Promise((resolve, reject) => {
		http.once('error', reject);
		http.listen(options.port, LOOPBACK_HOST, () => {
			const { port } = http.address() as AddressInfo;
			resolve({
				url: `http://${LOOPBACK_HOST}:${port}${ASSISTANT_PATH}`,
				close: () =>
					new Promise((closed) => {
						http.closeAllConnections();
						http.close(() => closed());
					}),
			});
		});
	});
}

async function handle(
	request: IncomingMessage,
	response: ServerResponse,
	options: AssistantServerOptions,
	address: AddressInfo | string | null,
): Promise<void> {
	if (new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`).pathname !== ASSISTANT_PATH) {
		response.writeHead(HttpStatus.NotFound).end();
		return;
	}
	if (!authorized(request, options.token)) {
		response.writeHead(HttpStatus.Unauthorized).end();
		return;
	}
	const port = typeof address === 'object' && address ? address.port : options.port;
	const server = createImageToolServer(options.images, options.identity);
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		enableDnsRebindingProtection: true,
		allowedHosts: [`${LOOPBACK_HOST}:${port}`, `${LOCALHOST_NAME}:${port}`],
	});
	response.on('close', () => {
		void transport.close();
		void server.close();
	});
	await server.connect(transport);
	await transport.handleRequest(request, response);
}

function authorized(request: IncomingMessage, token: string): boolean {
	const header = request.headers.authorization ?? '';
	if (!header.startsWith(BEARER_PREFIX)) return false;
	const given = Buffer.from(header.slice(BEARER_PREFIX.length));
	const expected = Buffer.from(token);
	return given.length === expected.length && timingSafeEqual(given, expected);
}
