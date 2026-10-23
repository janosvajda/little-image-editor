import type { IncomingMessage, ServerResponse } from 'node:http';
import {
	BRIDGE_CONTENT_TYPE,
	BRIDGE_MAX_REQUEST_BYTES,
	BRIDGE_PATH,
	BridgeOperation,
	type BridgeReply,
	type BridgeRequest,
	BridgeRequestError,
	type BridgeResults,
	parseBridgeRequest,
} from './bridgeProtocol';
import {
	HttpHeader,
	HttpMethod,
	HttpStatus,
	hasBearerToken,
	LOOPBACK_HOST,
	listenOnLoopback,
	loopbackHosts,
	requestPath,
} from './loopbackHttp';
import type { ExportableImages, PlaceableImages } from './openImages';

const BASE64 = 'base64';

/** Everything the bridge can do with the open images. */
export type BridgeImages = PlaceableImages & ExportableImages;

export interface BridgeServerOptions {
	/** 0 picks a free port, as tests do. */
	readonly port: number;
	/** Every request must carry it as a bearer token. */
	readonly token: string;
	readonly images: BridgeImages;
}

export interface RunningBridgeServer {
	readonly url: string;
	close(): Promise<void>;
}

/**
 * Answers bridge requests from MCP servers a developer runs on this computer.
 * Only loopback, only with the token, only JSON posts naming this server as
 * their Host: a web page can neither reach it nor rebind a name to it.
 */
export async function startBridgeServer(options: BridgeServerOptions): Promise<RunningBridgeServer> {
	const http = await listenOnLoopback(options.port, (request, response, port) => handle(request, response, options, port));
	return { url: `http://${LOOPBACK_HOST}:${http.port}${BRIDGE_PATH}`, close: () => http.close() };
}

async function handle(
	request: IncomingMessage,
	response: ServerResponse,
	options: BridgeServerOptions,
	port: number,
): Promise<void> {
	const refusal = refusalOf(request, options.token, port);
	if (refusal !== undefined) {
		response.writeHead(refusal).end();
		return;
	}
	let parsed: BridgeRequest;
	try {
		parsed = parseBridgeRequest(JSON.parse(await readBody(request)));
	} catch (error) {
		if (error instanceof BodyTooLargeError) {
			response.writeHead(HttpStatus.PayloadTooLarge).end();
			return;
		}
		reply(response, HttpStatus.BadRequest, { ok: false, error: messageOf(error) });
		return;
	}
	try {
		reply(response, HttpStatus.Ok, { ok: true, result: await run(options.images, parsed) });
	} catch (error) {
		reply(response, HttpStatus.Ok, { ok: false, error: messageOf(error) });
	}
}

function refusalOf(request: IncomingMessage, token: string, port: number): HttpStatus | undefined {
	if (requestPath(request) !== BRIDGE_PATH) return HttpStatus.NotFound;
	if (!hasBearerToken(request, token)) return HttpStatus.Unauthorized;
	if (!loopbackHosts(port).includes(request.headers.host ?? '')) return HttpStatus.Forbidden;
	if (request.method !== HttpMethod.Post) return HttpStatus.MethodNotAllowed;
	if (!request.headers['content-type']?.startsWith(BRIDGE_CONTENT_TYPE)) return HttpStatus.UnsupportedMediaType;
	return undefined;
}

/** Hands a request to the open images; each operation is one call on them. */
async function run(images: BridgeImages, request: BridgeRequest): Promise<BridgeResults[BridgeOperation]> {
	switch (request.operation) {
		case BridgeOperation.List:
			return images.list();
		case BridgeOperation.View: {
			const { png, ...view } = await images.view(request.image, request.maxSize);
			return { ...view, png: Buffer.from(png).toString(BASE64) };
		}
		case BridgeOperation.Command:
			return images.command(request.image, request.command);
		case BridgeOperation.Create:
			return images.create(request.name, request.spec);
		case BridgeOperation.Export:
			return images.export(request.image, request.request);
		case BridgeOperation.Place:
			return images.place(request.image, request.request);
	}
}

class BodyTooLargeError extends BridgeRequestError {}

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request as AsyncIterable<Buffer>) {
		size += chunk.length;
		if (size > BRIDGE_MAX_REQUEST_BYTES) throw new BodyTooLargeError();
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString();
}

function reply(response: ServerResponse, status: HttpStatus, body: BridgeReply): void {
	response.writeHead(status, { [HttpHeader.ContentType]: BRIDGE_CONTENT_TYPE }).end(JSON.stringify(body));
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
