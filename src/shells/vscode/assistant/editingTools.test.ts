import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantCommandKind, type AssistantCommand, type NewImageSpec } from '../../../app/features/assistant/assistantCommandTypes';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { EditingTool } from './editingTools';
import { ImageTool } from './imageTools';
import type { EditableImages } from './openImages';

const TOKEN = 'test-token';
const IDENTITY = { name: 'little-image-editor', version: '0.0.0' } as const;

/** Records what the tools ask the editor for. */
function recordingImages() {
	const commands: Array<{ image: string | undefined; command: AssistantCommand }> = [];
	const created: Array<{ name: string | undefined; spec: NewImageSpec }> = [];
	const images: EditableImages = {
		list: () => [],
		view: () => Promise.reject(new Error('not used')),
		command: async (image, command) => {
			commands.push({ image, command });
			if (command.kind === AssistantCommandKind.RemoveItem) throw new Error('No item has the id gone.');
			return { itemId: 'item-1', layerId: 'layer-1', layerName: 'Circles' };
		},
		create: async (name, spec) => {
			created.push({ name, spec });
			return { id: 'untitled:apple.png', name: 'apple.png', location: 'untitled:apple.png', active: true };
		},
	};
	return { images, commands, created };
}

let server: RunningAssistantServer | null = null;

afterEach(async () => {
	await server?.close();
	server = null;
});

async function connect(images: EditableImages): Promise<Client> {
	server = await startAssistantServer({ port: 0, token: TOKEN, images, identity: IDENTITY });
	const client = new Client({ name: 'test', version: '0.0.0' });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(server.url), {
			requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
		}),
	);
	return client;
}

describe('the editing tools', () => {
	it('are offered beside the viewing tools when the editor can be changed', async () => {
		const client = await connect(recordingImages().images);
		const names = (await client.listTools()).tools.map((tool) => tool.name);
		expect(names).toEqual([ImageTool.List, ImageTool.View, ...Object.values(EditingTool)]);
		await client.close();
	});

	it('create an image and draw on it with the defaults filled in', async () => {
		const { images, commands, created } = recordingImages();
		const client = await connect(images);
		const image = await client.callTool({ name: EditingTool.CreateImage, arguments: { name: 'apple.png', width: 512, height: 512 } });
		expect(JSON.stringify(image.content)).toContain('apple.png');
		expect(created).toEqual([{ name: 'apple.png', spec: { width: 512, height: 512, background: '#ffffff', transparent: false } }]);
		await client.callTool({
			name: EditingTool.AddShape,
			arguments: { layer: 'Circles', shape: 'ellipse', x: 10, y: 20, width: 100, height: 100, color: '#d62828' },
		});
		await client.callTool({ name: EditingTool.AddLine, arguments: { from_x: 0, from_y: 0, to_x: 50, to_y: 60, color: '#000000', arrow: true } });
		expect(commands.map(({ command }) => command)).toEqual([
			{
				kind: AssistantCommandKind.AddShape,
				layer: 'Circles',
				shape: 'ellipse',
				rect: { x: 10, y: 20, width: 100, height: 100 },
				color: '#d62828',
				fill: true,
				strokeWidth: 4,
				opacity: 1,
				rotation: 0,
			},
			{
				kind: AssistantCommandKind.AddLine,
				from: { x: 0, y: 0 },
				to: { x: 50, y: 60 },
				arrow: true,
				color: '#000000',
				width: 4,
				opacity: 1,
			},
		]);
		await client.close();
	});

	it('refuse a colour that is not #rrggbb, and report the editor refusing as a tool error', async () => {
		const { images, commands } = recordingImages();
		const client = await connect(images);
		const badColour = await client.callTool({
			name: EditingTool.AddText,
			arguments: { text: 'Hi', x: 0, y: 0, color: 'red' },
		});
		expect(badColour.isError).toBe(true);
		expect(commands).toHaveLength(0);
		const missing = await client.callTool({ name: EditingTool.RemoveItem, arguments: { item: 'gone' } });
		expect(missing).toMatchObject({ isError: true, content: [{ type: 'text', text: 'No item has the id gone.' }] });
		await client.close();
	});
});
