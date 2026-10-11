import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it } from 'vitest';
import { LineEnd } from '../../../app/features/annotations/lineEnd';
import { type AssistantCommand, AssistantCommandKind } from '../../../app/features/assistant/assistantCommandTypes';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { EditingTool } from './editingTools';
import type { EditableImages } from './openImages';

let server: RunningAssistantServer | null = null;
afterEach(async () => {
	await server?.close();
	server = null;
});

it('draws a vector path from SVG path data, filled and with its ends, as one command', async () => {
	const commands: AssistantCommand[] = [];
	const images: EditableImages = {
		list: () => [],
		view: () => Promise.reject(new Error('not used')),
		command: async (_image, command) => {
			commands.push(command);
			return { itemId: 'p', layerId: 'l', layerName: 'Layer 1' };
		},
		create: () => Promise.reject(new Error('not used')),
	};
	server = await startAssistantServer({ port: 0, token: 't', images, identity: { name: 'little-image-editor', version: '0' } });
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
	const result = await client.callTool({
		name: EditingTool.AddPath,
		arguments: { d: 'M10 10 C40 0 60 0 90 10 Z', color: '#333333', fill_color: '#ffcc00', dashed: true, head: LineEnd.Arrow },
	});
	expect(result.isError).not.toBe(true);
	expect(commands[0]).toEqual({
		kind: AssistantCommandKind.AddPath,
		d: 'M10 10 C40 0 60 0 90 10 Z',
		color: '#333333',
		width: 4,
		opacity: 1,
		fillColor: '#ffcc00',
		dashed: true,
		head: LineEnd.Arrow,
	});
	await client.close();
});
