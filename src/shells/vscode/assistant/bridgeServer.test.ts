import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	type AssistantCommand,
	AssistantCommandKind,
	type AssistantResult,
	type NewImageSpec,
} from '../../../app/features/assistant/assistantCommandTypes';
import { BridgeClient, bridgeForFolder } from './bridgeClient';
import { BRIDGE_CONTENT_TYPE, BridgeOperation, bridgeDiscoveryFile } from './bridgeProtocol';
import { type BridgeImages, type RunningBridgeServer, startBridgeServer } from './bridgeServer';
import { EditingTool } from './editingTools';
import { ExportTool } from './exportTools';
import { createImageToolServer, ImageTool } from './imageTools';
import { bearerHeader, HttpStatus } from './loopbackHttp';
import type { ImageExportRequest, ImagePlacementRequest } from './openImages';
import { PlaceTool } from './placeTools';

const TOKEN = 'bridge-test-token';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const IMAGE = { id: 'file:///project/a.png', name: 'a.png', location: '/project/a.png', active: true } as const;
const LAYER = { layerId: '7a569a26-7fa2-469d-a762-98bba53a7983', layerName: 'Sky' } as const;

interface Recorded {
	readonly commands: Array<{ image: string | undefined; command: AssistantCommand }>;
	readonly created: Array<{ name: string | undefined; spec: NewImageSpec }>;
	readonly exported: ImageExportRequest[];
	readonly placed: ImagePlacementRequest[];
}

function fakeImages(): { images: BridgeImages; recorded: Recorded } {
	const recorded: Recorded = { commands: [], created: [], exported: [], placed: [] };
	const images: BridgeImages = {
		list: () => [IMAGE],
		view: async (image, maxSize) => {
			if (image === 'missing') throw new Error('No open image is called missing.');
			return { name: IMAGE.name, png: PNG_BYTES, width: maxSize, height: maxSize / 2, imageWidth: 800, imageHeight: 400 };
		},
		command: async (image, command): Promise<AssistantResult> => {
			recorded.commands.push({ image, command });
			return LAYER;
		},
		create: async (name, spec) => {
			recorded.created.push({ name, spec });
			return { ...IMAGE, name: name ?? IMAGE.name };
		},
		export: async (_image, request) => {
			recorded.exported.push(request);
			return { path: request.path, format: 'png', width: 800, height: 400, bytesWritten: PNG_BYTES.length };
		},
		place: async (_image, request) => {
			recorded.placed.push(request);
			return LAYER;
		},
	};
	return { images, recorded };
}

let server: RunningBridgeServer | null = null;
let home: string | null = null;

afterEach(async () => {
	await server?.close();
	server = null;
	if (home) await rm(home, { recursive: true, force: true });
	home = null;
});

async function serve(images: BridgeImages): Promise<RunningBridgeServer> {
	server = await startBridgeServer({ port: 0, token: TOKEN, images });
	return server;
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
	return fetch(url, {
		method: 'POST',
		headers: { Authorization: bearerHeader(TOKEN), 'Content-Type': BRIDGE_CONTENT_TYPE, ...headers },
		body: JSON.stringify(body),
	});
}

async function mcpClient(images: BridgeImages): Promise<Client> {
	const server = createImageToolServer(images, { name: 'little-image-editor', version: '0' });
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(clientSide);
	return client;
}

describe('the assistant bridge', () => {
	it('refuses requests without the token, at another path, by GET or without JSON', async () => {
		const { url } = await serve(fakeImages().images);
		const list = { operation: BridgeOperation.List };
		expect((await post(url, list, { Authorization: bearerHeader('wrong') })).status).toBe(HttpStatus.Unauthorized);
		expect((await post(url.replace('/bridge', '/mcp'), list)).status).toBe(HttpStatus.NotFound);
		expect((await fetch(url, { headers: { Authorization: bearerHeader(TOKEN) } })).status).toBe(HttpStatus.MethodNotAllowed);
		expect((await post(url, list, { 'Content-Type': 'text/plain' })).status).toBe(HttpStatus.UnsupportedMediaType);
	});

	it('answers a malformed request with why, and a failed operation with its error', async () => {
		const { url } = await serve(fakeImages().images);
		const malformed = await post(url, { operation: 'format-disk' });
		expect(malformed.status).toBe(HttpStatus.BadRequest);
		expect(await malformed.json()).toMatchObject({ ok: false, error: expect.stringContaining('operation') });
		const failed = await post(url, { operation: BridgeOperation.View, image: 'missing', maxSize: 64 });
		expect(await failed.json()).toEqual({ ok: false, error: 'No open image is called missing.' });
	});

	it('carries every operation to the open images through the client, with pictures intact', async () => {
		const { images, recorded } = fakeImages();
		const { url } = await serve(images);
		const client = new BridgeClient(async () => ({ url, token: TOKEN, folder: '/project', pid: 1 }));
		expect(await client.list()).toEqual([IMAGE]);
		const view = await client.view(undefined, 256);
		expect([...view.png]).toEqual([...PNG_BYTES]);
		expect(view).toMatchObject({ name: IMAGE.name, width: 256, height: 128, imageWidth: 800 });
		const command: AssistantCommand = { kind: AssistantCommandKind.AddLayer, name: 'Sky' };
		expect(await client.command(IMAGE.id, command)).toEqual(LAYER);
		expect(recorded.commands).toEqual([{ image: IMAGE.id, command }]);
		const spec: NewImageSpec = { width: 64, height: 32, background: '#ffffff', transparent: false };
		await client.create('icon.png', spec);
		expect(recorded.created).toEqual([{ name: 'icon.png', spec }]);
		await client.export(undefined, { path: 'out/a.png', overwrite: false });
		expect(recorded.exported).toEqual([{ path: 'out/a.png', overwrite: false }]);
		await client.place(undefined, { path: 'logo.svg', at: { x: 1, y: 2 }, width: 10 });
		expect(recorded.placed).toEqual([{ path: 'logo.svg', at: { x: 1, y: 2 }, width: 10 }]);
		await expect(client.view('missing', 64)).rejects.toThrow('No open image is called missing.');
	});

	it('serves the MCP tools through the bridge, as the developer-run server does', async () => {
		const { images, recorded } = fakeImages();
		const { url } = await serve(images);
		home = await mkdtemp(join(tmpdir(), 'bridge-home-'));
		const discoveryFile = bridgeDiscoveryFile('/project', home);
		await mkdir(dirname(discoveryFile), { recursive: true });
		await writeFile(discoveryFile, JSON.stringify({ url, token: TOKEN, folder: '/project', pid: 1 }));
		const client = await mcpClient(new BridgeClient(bridgeForFolder('/project', home)));
		const tools = (await client.listTools()).tools.map(({ name }) => name);
		expect(tools).toEqual(expect.arrayContaining([ImageTool.List, ImageTool.View, EditingTool.Draw, ExportTool.Image, PlaceTool.Image]));
		const listed = await client.callTool({ name: ImageTool.List, arguments: {} });
		expect((listed.content as Array<{ text: string }>)[0]!.text).toBe(JSON.stringify([IMAGE]));
		const viewed = await client.callTool({ name: ImageTool.View, arguments: {} });
		expect((viewed.content as Array<{ type: string; data?: string }>)[0]).toMatchObject({
			type: 'image',
			data: Buffer.from(PNG_BYTES).toString('base64'),
		});
		await client.callTool({ name: EditingTool.AddLayer, arguments: { name: 'Sky' } });
		expect(recorded.commands).toEqual([{ image: undefined, command: { kind: AssistantCommandKind.AddLayer, name: 'Sky' } }]);
		await client.close();
	});

	it('tells the assistant how to turn the bridge on when VS Code is not serving the folder', async () => {
		home = await mkdtemp(join(tmpdir(), 'bridge-home-'));
		const client = new BridgeClient(bridgeForFolder('/not-open', home));
		await expect(client.list()).rejects.toThrow('littleImageEditor.assistantBridge.enabled');
	});
});
