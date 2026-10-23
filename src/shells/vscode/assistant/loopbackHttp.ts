import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Only this computer can connect; the servers never listen on a network address. */
export const LOOPBACK_HOST = '127.0.0.1';
const LOCALHOST_NAME = 'localhost';
const BEARER_PREFIX = 'Bearer ';

export const HttpStatus = {
	Ok: 200,
	BadRequest: 400,
	Unauthorized: 401,
	Forbidden: 403,
	NotFound: 404,
	MethodNotAllowed: 405,
	PayloadTooLarge: 413,
	UnsupportedMediaType: 415,
} as const;
export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

export const HttpHeader = { Authorization: 'Authorization', ContentType: 'Content-Type' } as const;
export const HttpMethod = { Post: 'POST' } as const;

export type LoopbackRequestHandler = (
	request: IncomingMessage,
	response: ServerResponse,
	port: number,
) => Promise<void>;

export interface LoopbackServer {
	readonly port: number;
	close(): Promise<void>;
}

/** Listens on this computer only; 0 picks a free port, as tests do. */
export function listenOnLoopback(port: number, handler: LoopbackRequestHandler): Promise<LoopbackServer> {
	const http = createServer((request, response) => void handler(request, response, boundPort(http.address(), port)));
	return new Promise((resolve, reject) => {
		http.once('error', reject);
		http.listen(port, LOOPBACK_HOST, () => {
			resolve({
				port: boundPort(http.address(), port),
				close: () =>
					new Promise((closed) => {
						http.closeAllConnections();
						http.close(() => closed());
					}),
			});
		});
	});
}

/** The Host values a page on this computer sends; any other names a foreign site rebinding to loopback. */
export function loopbackHosts(port: number): readonly string[] {
	return [`${LOOPBACK_HOST}:${port}`, `${LOCALHOST_NAME}:${port}`];
}

export function requestPath(request: IncomingMessage): string {
	return new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`).pathname;
}

/** Compares the bearer token in constant time. */
export function hasBearerToken(request: IncomingMessage, token: string): boolean {
	const header = request.headers.authorization ?? '';
	if (!header.startsWith(BEARER_PREFIX)) return false;
	const given = Buffer.from(header.slice(BEARER_PREFIX.length));
	const expected = Buffer.from(token);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

export function bearerHeader(token: string): string {
	return `${BEARER_PREFIX}${token}`;
}

function boundPort(address: AddressInfo | string | null, fallback: number): number {
	return typeof address === 'object' && address ? address.port : fallback;
}
