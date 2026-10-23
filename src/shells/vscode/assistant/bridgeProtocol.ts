import { homedir } from 'node:os';
import { join } from 'node:path';
import {
	type AssistantCommand,
	AssistantCommandKind,
	type AssistantResult,
	type NewImageSpec,
} from '../../../app/features/assistant/assistantCommandTypes';
import { projectKey } from './assistantPort';
import type {
	ImageExportRequest,
	ImageExportResult,
	ImagePlacementRequest,
	OpenImageSummary,
	OpenImageView,
} from './openImages';

/**
 * The assistant bridge: how a separately run MCP server reaches the images
 * open in VS Code. The extension answers these requests; it serves no MCP
 * itself. Every request is one JSON object posted to BRIDGE_PATH with the
 * bridge's bearer token, and every reply is a BridgeReply.
 */
export const BRIDGE_PATH = '/bridge';
export const BRIDGE_CONTENT_TYPE = 'application/json';
/** 16 MiB: draw scripts and diagrams are text, and nothing a bridge request carries comes near this. */
export const BRIDGE_MAX_REQUEST_BYTES = 16_777_216;

/** Must match `contributes.configuration` in the extension manifest; the bridge is off until it is turned on. */
export const BridgeSetting = { Section: 'littleImageEditor.assistantBridge', Enabled: 'enabled' } as const;
export const BRIDGE_ENABLED_SETTING = `${BridgeSetting.Section}.${BridgeSetting.Enabled}`;

export const BridgeOperation = {
	List: 'list',
	View: 'view',
	Command: 'command',
	Create: 'create',
	Export: 'export',
	Place: 'place',
} as const;
export type BridgeOperation = (typeof BridgeOperation)[keyof typeof BridgeOperation];

export type BridgeRequest =
	| Readonly<{ operation: typeof BridgeOperation.List }>
	| Readonly<{ operation: typeof BridgeOperation.View; image?: string; maxSize: number }>
	| Readonly<{ operation: typeof BridgeOperation.Command; image?: string; command: AssistantCommand }>
	| Readonly<{ operation: typeof BridgeOperation.Create; name?: string; spec: NewImageSpec }>
	| Readonly<{ operation: typeof BridgeOperation.Export; image?: string; request: ImageExportRequest }>
	| Readonly<{ operation: typeof BridgeOperation.Place; image?: string; request: ImagePlacementRequest }>;

export type BridgeRequestOf<Operation extends BridgeOperation> = Extract<BridgeRequest, { operation: Operation }>;

/** A picture as JSON carries it: the PNG as base64. */
export type BridgeImageView = Omit<OpenImageView, 'png'> & Readonly<{ png: string }>;

export interface BridgeResults {
	readonly [BridgeOperation.List]: readonly OpenImageSummary[];
	readonly [BridgeOperation.View]: BridgeImageView;
	readonly [BridgeOperation.Command]: AssistantResult;
	readonly [BridgeOperation.Create]: OpenImageSummary;
	readonly [BridgeOperation.Export]: ImageExportResult;
	readonly [BridgeOperation.Place]: AssistantResult;
}

export type BridgeReply<Operation extends BridgeOperation = BridgeOperation> =
	| Readonly<{ ok: true; result: BridgeResults[Operation] }>
	| Readonly<{ ok: false; error: string }>;

/** Where a running bridge tells MCP servers on this computer its address and token. */
export interface BridgeDiscovery {
	readonly url: string;
	readonly token: string;
	/** The project folder the bridge serves, as VS Code names it. */
	readonly folder: string;
	readonly pid: number;
}

const DiscoveryLocation = {
	Directory: '.little-image-editor',
	Bridges: 'bridges',
	Extension: '.json',
} as const;

/** Readable only by this user: the files hold the bridge's token. */
export const DiscoveryPermission = { Directory: 0o700, File: 0o600 } as const;

export function bridgeDiscoveryDirectory(home: string = homedir()): string {
	return join(home, DiscoveryLocation.Directory, DiscoveryLocation.Bridges);
}

/** One file per project folder, so several VS Code windows each publish their own bridge. */
export function bridgeDiscoveryFile(folderPath: string, home?: string): string {
	return join(bridgeDiscoveryDirectory(home), `${projectKey(folderPath)}${DiscoveryLocation.Extension}`);
}

export class BridgeRequestError extends Error {}

/** Checks a request's shape; the editor checks each drawing command's contents as it runs it. */
export function parseBridgeRequest(value: unknown): BridgeRequest {
	if (!isRecord(value) || !isBridgeOperation(value.operation))
		throw new BridgeRequestError(`A bridge request needs an operation: ${Object.values(BridgeOperation).join(', ')}.`);
	const image = optionalString(value, 'image');
	const target = image === undefined ? {} : { image };
	switch (value.operation) {
		case BridgeOperation.List:
			return { operation: value.operation };
		case BridgeOperation.View:
			return { operation: value.operation, ...target, maxSize: requiredNumber(value, 'maxSize') };
		case BridgeOperation.Command:
			if (!isRecord(value.command) || !isCommandKind(value.command.kind))
				throw new BridgeRequestError('A command request needs a command with a known kind.');
			return { operation: value.operation, ...target, command: value.command as unknown as AssistantCommand };
		case BridgeOperation.Create: {
			const name = optionalString(value, 'name');
			return { operation: value.operation, ...(name === undefined ? {} : { name }), spec: newImageSpec(value.spec) };
		}
		case BridgeOperation.Export:
			return { operation: value.operation, ...target, request: exportRequest(value.request) };
		case BridgeOperation.Place:
			return { operation: value.operation, ...target, request: placementRequest(value.request) };
	}
}

/** Reads a discovery file's contents, refusing anything that is not one. */
export function parseBridgeDiscovery(value: unknown): BridgeDiscovery {
	if (!isRecord(value)) throw new BridgeRequestError('The bridge discovery file is not an object.');
	return {
		url: requiredString(value, 'url'),
		token: requiredString(value, 'token'),
		folder: requiredString(value, 'folder'),
		pid: requiredNumber(value, 'pid'),
	};
}

export function isBridgeReply(value: unknown): value is BridgeReply {
	if (!isRecord(value)) return false;
	return value.ok === true ? 'result' in value : value.ok === false && typeof value.error === 'string';
}

function newImageSpec(value: unknown): NewImageSpec {
	if (!isRecord(value)) throw new BridgeRequestError('A create request needs a spec.');
	if (typeof value.transparent !== 'boolean') throw new BridgeRequestError('spec.transparent must be a boolean.');
	return {
		width: requiredNumber(value, 'width'),
		height: requiredNumber(value, 'height'),
		background: requiredString(value, 'background'),
		transparent: value.transparent,
	};
}

function exportRequest(value: unknown): ImageExportRequest {
	if (!isRecord(value)) throw new BridgeRequestError('An export request needs a request.');
	if (typeof value.overwrite !== 'boolean') throw new BridgeRequestError('request.overwrite must be a boolean.');
	const workspace = optionalString(value, 'workspace');
	return {
		path: requiredString(value, 'path'),
		overwrite: value.overwrite,
		...(workspace === undefined ? {} : { workspace }),
	};
}

function placementRequest(value: unknown): ImagePlacementRequest {
	if (!isRecord(value)) throw new BridgeRequestError('A place request needs a request.');
	const workspace = optionalString(value, 'workspace');
	const layer = optionalString(value, 'layer');
	const width = optionalNumber(value, 'width');
	const height = optionalNumber(value, 'height');
	return {
		path: requiredString(value, 'path'),
		...(workspace === undefined ? {} : { workspace }),
		...(layer === undefined ? {} : { layer }),
		...(value.at === undefined ? {} : { at: point(value.at) }),
		...(width === undefined ? {} : { width }),
		...(height === undefined ? {} : { height }),
	};
}

function point(value: unknown): Readonly<{ x: number; y: number }> {
	if (!isRecord(value)) throw new BridgeRequestError('request.at must be a point.');
	return { x: requiredNumber(value, 'x'), y: requiredNumber(value, 'y') };
}

function isBridgeOperation(value: unknown): value is BridgeOperation {
	return Object.values(BridgeOperation).some((operation) => operation === value);
}

function isCommandKind(value: unknown): value is AssistantCommandKind {
	return Object.values(AssistantCommandKind).some((kind) => kind === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value !== 'string' || !value) throw new BridgeRequestError(`${key} must be a non-empty string.`);
	return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
	return record[key] === undefined ? undefined : requiredString(record, key);
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new BridgeRequestError(`${key} must be a number.`);
	return value;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
	return record[key] === undefined ? undefined : requiredNumber(record, key);
}
