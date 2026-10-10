import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { ImageTool } from './imageTools';
import type { OpenImages } from './openImages';

const TOKEN = 'test-token';
const IDENTITY = { name: 'little-image-editor', version: '0.0.0' } as const;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const twoImages: OpenImages = {
	list: () => [
		{ id: 'file:///a.png', name: 'a.png', location: '/a.png', active: true },
		{ id: 'file:///b.limg', name: 'b.limg', location: '/b.limg', active: false },
	],
	view: async (image, maxSize) => {
		if (image === 'missing') throw new Error('No open image is called missing.');
		return { name: image ?? 'a.png', png: PNG_BYTES, width: Math.min(maxSize, 800), height: 400, imageWidth: 800, imageHeight: 400 };
	},
};

let server: RunningAssistantServer | null = null;

afterEach(async () => {
	await server?.close();
	server = null;
});

async function connect(token: string): Promise<Client> {
	server ??= await startAssistantServer({ port: 0, token: TOKEN, images: twoImages, identity: IDENTITY });
	const client = new Client({ name: 'test', version: '0.0.0' });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(server.url), {
			requestInit: { headers: { Authorization: `Bearer ${token}` } },
		}),
	);
	return client;
}

describe('the assistant server', () => {
	it('lists the open images and shows one as a PNG picture with its sizes', async () => {
		const client = await connect(TOKEN);
		expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([ImageTool.List, ImageTool.View]);
		const list = await client.callTool({ name: ImageTool.List });
		expect(JSON.stringify(list.content)).toContain('b.limg');
		const view = await client.callTool({ name: ImageTool.View, arguments: { image: 'b.limg', max_size: 200 } });
		expect(view.content).toEqual([
			{ type: 'image', data: Buffer.from(PNG_BYTES).toString('base64'), mimeType: 'image/png' },
			{ type: 'text', text: 'b.limg: 800 × 400 px, shown at 200 × 400 px.' },
		]);
		await client.close();
	});

	it('reports a missing image as a tool error, not a failure of the connection', async () => {
		const client = await connect(TOKEN);
		const view = await client.callTool({ name: ImageTool.View, arguments: { image: 'missing' } });
		expect(view.isError).toBe(true);
		expect(view.content).toEqual([{ type: 'text', text: 'No open image is called missing.' }]);
		await client.close();
	});

	it('refuses a client without the secret token, and answers only on its own path', async () => {
		await expect(connect('wrong-token')).rejects.toThrow();
		const other = new URL(server!.url);
		other.pathname = '/other';
		expect((await fetch(other)).status).toBe(404);
	});

	it('refuses a request a web page made, whose Host names another site, even with the token', async () => {
		await connect(TOKEN);
		const { port } = new URL(server!.url);
		const status = await new Promise<number | undefined>((resolve, reject) => {
			const call = request(
				{
					host: '127.0.0.1',
					port,
					path: '/mcp',
					method: 'POST',
					headers: {
						Host: 'attacker.example',
						Authorization: `Bearer ${TOKEN}`,
						'Content-Type': 'application/json',
						Accept: 'application/json, text/event-stream',
					},
				},
				(response) => resolve(response.statusCode),
			);
			call.on('error', reject);
			call.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
		});
		expect(status).toBe(403);
	});

	it('listens only on this computer', async () => {
		await connect(TOKEN);
		expect(new URL(server!.url).hostname).toBe('127.0.0.1');
	});
});
