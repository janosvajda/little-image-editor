import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AssistantCommand, AssistantResult, NewImageSpec } from '../../../app/features/assistant/assistantCommandTypes';
import {
	BRIDGE_CONTENT_TYPE,
	BRIDGE_ENABLED_SETTING,
	type BridgeDiscovery,
	BridgeOperation,
	type BridgeRequestOf,
	type BridgeResults,
	bridgeDiscoveryFile,
	isBridgeReply,
	parseBridgeDiscovery,
} from './bridgeProtocol';
import type { BridgeImages } from './bridgeServer';
import { bearerHeader, HttpHeader, HttpMethod } from './loopbackHttp';
import type {
	ImageExportRequest,
	ImageExportResult,
	ImagePlacementRequest,
	OpenImageSummary,
	OpenImageView,
} from './openImages';

const BASE64 = 'base64';
const FILE_NOT_FOUND = 'ENOENT';

/** Finds the running bridge, for example by reading the discovery file of a project folder. */
export type BridgeLocator = () => Promise<BridgeDiscovery>;

/**
 * The open images in VS Code, reached through the extension's bridge. The
 * bridge is looked up for every call, so the MCP server keeps working when
 * VS Code restarts or the bridge moves to another port.
 */
export class BridgeClient implements BridgeImages {
	constructor(private readonly locate: BridgeLocator) {}

	list(): Promise<readonly OpenImageSummary[]> {
		return this.send({ operation: BridgeOperation.List });
	}

	async view(image: string | undefined, maxSize: number): Promise<OpenImageView> {
		const { png, ...view } = await this.send({ operation: BridgeOperation.View, ...target(image), maxSize });
		return { ...view, png: new Uint8Array(Buffer.from(png, BASE64)) };
	}

	command(image: string | undefined, command: AssistantCommand): Promise<AssistantResult> {
		return this.send({ operation: BridgeOperation.Command, ...target(image), command });
	}

	create(name: string | undefined, spec: NewImageSpec): Promise<OpenImageSummary> {
		return this.send({ operation: BridgeOperation.Create, ...(name === undefined ? {} : { name }), spec });
	}

	export(image: string | undefined, request: ImageExportRequest): Promise<ImageExportResult> {
		return this.send({ operation: BridgeOperation.Export, ...target(image), request });
	}

	place(image: string | undefined, request: ImagePlacementRequest): Promise<AssistantResult> {
		return this.send({ operation: BridgeOperation.Place, ...target(image), request });
	}

	private async send<Operation extends BridgeOperation>(
		request: BridgeRequestOf<Operation>,
	): Promise<BridgeResults[Operation]> {
		const { url, token } = await this.locate();
		const response = await fetch(url, {
			method: HttpMethod.Post,
			headers: { [HttpHeader.Authorization]: bearerHeader(token), [HttpHeader.ContentType]: BRIDGE_CONTENT_TYPE },
			body: JSON.stringify(request),
		});
		const body: unknown = await response.json().catch(() => undefined);
		if (!isBridgeReply(body)) throw new Error(`The Little Image Editor bridge answered with HTTP ${response.status}.`);
		if (!body.ok) throw new Error(body.error);
		return body.result as BridgeResults[Operation];
	}
}

/**
 * Reads the bridge that VS Code published for a project folder. The folder
 * is tried as given and with its links resolved, as VS Code may name either.
 */
export function bridgeForFolder(folder: string, home?: string): BridgeLocator {
	return async () => {
		const given = resolve(folder);
		const candidates = [...new Set([given, await realpath(given).catch(() => given)])];
		for (const candidate of candidates) {
			const discovery = await readDiscovery(bridgeDiscoveryFile(candidate, home));
			if (discovery) return discovery;
		}
		throw new Error(
			`Little Image Editor is not serving ${given}. Open that folder in VS Code and turn on the "${BRIDGE_ENABLED_SETTING}" setting.`,
		);
	};
}

async function readDiscovery(file: string): Promise<BridgeDiscovery | undefined> {
	try {
		return parseBridgeDiscovery(JSON.parse(await readFile(file, 'utf8')));
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === FILE_NOT_FOUND) return undefined;
		throw error;
	}
}

function target(image: string | undefined): Readonly<{ image?: string }> {
	return image === undefined ? {} : { image };
}
