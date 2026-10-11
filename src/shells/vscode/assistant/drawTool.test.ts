import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type AssistantCommand, AssistantCommandKind, type AssistantResult } from '../../../app/features/assistant/assistantCommandTypes';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { EditingTool } from './editingTools';
import type { EditableImages } from './openImages';

const LAYER_ID = '7a569a26-7fa2-469d-a762-98bba53a7983';
const ITEM_ID = '0956c768-8ebf-4e7b-a25c-942c0fc395f3';

function images(answer: (command: AssistantCommand) => AssistantResult) {
	const calls: Array<{ image: string | undefined; command: AssistantCommand }> = [];
	const created: string[] = [];
	const source: EditableImages = {
		list: () => [],
		view: () => Promise.reject(new Error('not used')),
		command: async (image, command) => {
			calls.push({ image, command });
			return answer(command);
		},
		create: async (name) => {
			created.push(name ?? '');
			return { id: `untitled:/project/${name}`, name: name ?? '', location: '', active: true };
		},
	};
	return { source, calls, created };
}

let server: RunningAssistantServer | null = null;
afterEach(async () => {
	await server?.close();
	server = null;
});

async function connect(source: EditableImages): Promise<Client> {
	server = await startAssistantServer({ port: 0, token: 't', images: source, identity: { name: 'little-image-editor', version: '0' } });
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
	return client;
}

async function text(client: Client, name: string, args: Record<string, unknown>) {
	const result = await client.callTool({ name, arguments: args });
	return { isError: result.isError === true, text: (result.content as Array<{ text: string }>)[0]!.text };
}

describe('drawing in one call', () => {
	it('creates the image the script names and sends the rest as one batch, with a short reply', async () => {
		const { source, calls, created } = images(() => ({ batch: { layers: ['Circles'], items: 2 } }));
		const client = await connect(source);
		const reply = await text(client, EditingTool.Draw, {
			script: 'image fruit.png 512x512\nlayer Circles\ncircle 40,40 110 #3a86ff\ncircle 362,40 110 #ffbe0b',
		});
		expect(reply).toEqual({ isError: false, text: 'ok: created fruit.png; added 1 layer (Circles), 2 items' });
		expect(created).toEqual(['fruit.png']);
		expect(calls).toHaveLength(1);
		expect(calls[0]!.image).toBe('untitled:/project/fruit.png');
		expect(calls[0]!.command).toMatchObject({ kind: AssistantCommandKind.Batch, commands: [{ name: 'Circles' }, { shape: 'ellipse' }, { shape: 'ellipse' }] });
		await client.close();
	});

	it('points a mistake at its script line, before or after the editor sees it', async () => {
		const { source, calls } = images(() => {
			throw new Error('Step 2: No layer is called "Sky".');
		});
		const client = await connect(source);
		expect(await text(client, EditingTool.Draw, { script: 'layer A\ncircle 1,1 5 blue' })).toEqual({
			isError: true,
			text: 'Line 2: expected a colour such as #d62828 but found "blue".',
		});
		expect(calls).toHaveLength(0);
		expect(await text(client, EditingTool.Draw, { script: 'layer A\n\nuse Sky\nrect 0,0 5x5 #000000' })).toEqual({
			isError: true,
			text: 'Line 4: No layer is called "Sky". Nothing was drawn.',
		});
		await client.close();
	});
});

describe('short replies', () => {
	it('describe an image in a line per layer and item, with short ids', async () => {
		const { source } = images(() => ({
			document: {
				name: 'fruit',
				width: 512,
				height: 512,
				layers: [
					{ id: LAYER_ID, name: 'Apple', visible: false, locked: false, active: true, items: [{ id: ITEM_ID, type: 'shape', shape: 'ellipse', color: '#d62828', bounds: { x: 150.4, y: 215, width: 125, height: 195.6 } }] },
					{ id: ITEM_ID, name: 'Notes', visible: true, locked: true, active: false, items: [{ id: LAYER_ID, type: 'text', text: 'Hi', color: '#000000', bounds: { x: 1, y: 2, width: 30, height: 12 } }] },
				],
			},
		}));
		const client = await connect(source);
		expect((await text(client, EditingTool.DescribeImage, {})).text).toBe(
			[
				'fruit 512x512; layers bottom first; ids can be passed back',
				'Apple 7a569a26 [active, hidden]',
				'  0956c768 ellipse #d62828 150,215 125x196',
				'Notes 0956c768 [locked]',
				'  7a569a26 text #000000 1,2 30x12 "Hi"',
			].join('\n'),
		);
		await client.close();
	});

	it('answer an added item with its short id and layer', async () => {
		const { source } = images(() => ({ itemId: ITEM_ID, layerId: LAYER_ID, layerName: 'Apple' }));
		const client = await connect(source);
		const reply = await text(client, EditingTool.AddText, { text: 'Hi', x: 0, y: 0, color: '#000000' });
		expect(reply.text).toBe('ok: item 0956c768 on layer Apple (7a569a26)');
		await client.close();
	});
});
