import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it } from 'vitest';
import { GradientKind, linearGradient, radialGradient } from '../../../app/core/geometry/gradient';
import type { AssistantCommand } from '../../../app/features/assistant/assistantCommandTypes';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { EditingTool } from './editingTools';
import type { EditableImages } from './openImages';

let server: RunningAssistantServer | null = null;
afterEach(async () => {
	await server?.close();
	server = null;
});

it('fills shapes and paths with linear and radial gradients', async () => {
	const commands: AssistantCommand[] = [];
	const images: EditableImages = {
		list: () => [],
		view: () => Promise.reject(new Error('not used')),
		command: async (_image, command) => {
			commands.push(command);
			return { itemId: 'i', layerId: 'l', layerName: 'Layer 1' };
		},
		create: () => Promise.reject(new Error('not used')),
	};
	server = await startAssistantServer({ port: 0, token: 't', images, identity: { name: 'little-image-editor', version: '0' } });
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
	const colors = ['#ff6600', '#ffee00'];
	await client.callTool({
		name: EditingTool.AddShape,
		arguments: { shape: 'rectangle', x: 0, y: 0, width: 80, height: 40, color: '#333333', fill_gradient: { kind: GradientKind.Linear, colors, angle: 90 } },
	});
	await client.callTool({ name: EditingTool.AddPath, arguments: { d: 'M0 0 L10 0 L10 10 Z', color: '#000000', fill_gradient: { kind: GradientKind.Radial, colors } } });
	expect(commands[0]).toMatchObject({ fill: true, fillGradient: linearGradient(colors, 90) });
	expect(commands[1]).toMatchObject({ fillGradient: radialGradient(colors) });
	const refused = await client.callTool({ name: EditingTool.AddPath, arguments: { d: 'M0 0 L1 1', color: '#000000', fill_gradient: { kind: GradientKind.Linear, colors: ['#ff6600'] } } });
	expect(refused.isError).toBe(true);
	await client.close();
});
