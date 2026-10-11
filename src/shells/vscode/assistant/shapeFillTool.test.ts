import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it } from 'vitest';
import { type AssistantCommand, AssistantCommandKind } from '../../../app/features/assistant/assistantCommandTypes';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { EditingTool } from './editingTools';
import type { EditableImages } from './openImages';

let server: RunningAssistantServer | null = null;
afterEach(async () => {
	await server?.close();
	server = null;
});

it('draws a box filled with its own colour under an outline, and ignores the fill colour of an outlined one', async () => {
	const commands: AssistantCommand[] = [];
	const images: EditableImages = {
		list: () => [],
		view: () => Promise.reject(new Error('not used')),
		command: async (_image, command) => {
			commands.push(command);
			return { item: 'box' };
		},
		create: () => Promise.reject(new Error('not used')),
	};
	server = await startAssistantServer({ port: 0, token: 't', images, identity: { name: 'little-image-editor', version: '0' } });
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
	const box = { shape: 'rectangle', x: 0, y: 0, width: 80, height: 40, color: '#333333', fill_color: '#ffeeaa' };
	await client.callTool({ name: EditingTool.AddShape, arguments: box });
	await client.callTool({ name: EditingTool.AddShape, arguments: { ...box, fill: false } });
	expect(commands[0]).toMatchObject({ kind: AssistantCommandKind.AddShape, color: '#333333', fill: true, fillColor: '#ffeeaa' });
	expect(commands[1]).not.toHaveProperty('fillColor');
	await client.close();
});
