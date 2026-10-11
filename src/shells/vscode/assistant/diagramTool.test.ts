import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type AssistantCommand, AssistantCommandKind, type NewImageSpec } from '../../../app/features/assistant/assistantCommandTypes';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { EditingTool } from './editingTools';
import type { EditableImages } from './openImages';

function recording() {
	const calls: Array<{ image: string | undefined; command: AssistantCommand }> = [];
	const created: Array<{ name: string | undefined; spec: NewImageSpec }> = [];
	const images: EditableImages = {
		list: () => [],
		view: () => Promise.reject(new Error('not used')),
		command: async (image, command) => {
			calls.push({ image, command });
			return { batch: { layers: ['Connections', 'Nodes'], items: 9 } };
		},
		create: async (name, spec) => {
			created.push({ name, spec });
			return { id: `untitled:/project/${name}`, name: name ?? '', location: '', active: true };
		},
	};
	return { images, calls, created };
}

let server: RunningAssistantServer | null = null;
afterEach(async () => {
	await server?.close();
	server = null;
});

async function connect(images: EditableImages): Promise<Client> {
	server = await startAssistantServer({ port: 0, token: 't', images, identity: { name: 'little-image-editor', version: '0' } });
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
	return client;
}

const reply = async (client: Client, args: Record<string, unknown>) => {
	const result = await client.callTool({ name: EditingTool.Draw, arguments: args });
	return { isError: result.isError === true, text: (result.content as Array<{ text: string }>)[0]!.text };
};

describe('drawing a Mermaid diagram in one call', () => {
	it('opens an image sized to the diagram and draws it as one batch', async () => {
		const { images, calls, created } = recording();
		const client = await connect(images);
		expect(await reply(client, { diagram: 'flowchart LR\n  web[Web] -->|HTTPS| api[API]', name: 'architecture.png' })).toEqual({
			isError: false,
			text: 'ok: created architecture.png; added 2 layers (Connections, Nodes), 9 items',
		});
		expect(created).toHaveLength(1);
		expect(created[0]!.name).toBe('architecture.png');
		expect(created[0]!.spec.width).toBeGreaterThan(created[0]!.spec.height);
		expect(calls).toHaveLength(1);
		expect(calls[0]!.image).toBe('untitled:/project/architecture.png');
		expect(calls[0]!.command.kind).toBe(AssistantCommandKind.Batch);
		await client.close();
	});

	it('draws onto a named image without opening one, and reports a diagram mistake by its line', async () => {
		const { images, calls, created } = recording();
		const client = await connect(images);
		await reply(client, { image: 'notes.png', diagram: 'graph TD\n  a --> b' });
		expect(created).toHaveLength(0);
		expect(calls[0]!.image).toBe('notes.png');
		expect(await reply(client, { diagram: 'flowchart LR\n  a ~~ b' })).toEqual({
			isError: true,
			text: 'Diagram: Line 2: Expected a link such as --> at "~~ b".',
		});
		expect(await reply(client, {})).toEqual({ isError: true, text: 'Give draw a script, a diagram, or both.' });
		await client.close();
	});
});
