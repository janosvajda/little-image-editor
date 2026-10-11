import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
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

async function connected() {
	const commands: AssistantCommand[] = [];
	const images: EditableImages = {
		list: () => [],
		view: () => Promise.reject(new Error('not used')),
		command: async (_image, command) => {
			commands.push(command);
			return { batch: { layers: [], items: 1 } };
		},
		create: async (name) => ({ id: `untitled:/project/${name}`, name: name ?? '', location: '', active: true }),
	};
	server = await startAssistantServer({ port: 0, token: 't', images, identity: { name: 'little-image-editor', version: '0' } });
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
	const call = async (name: string, args: Record<string, unknown>) => {
		const result = await client.callTool({ name, arguments: args });
		return { isError: result.isError === true, text: (result.content as Array<{ text: string }>)[0]!.text };
	};
	return { client, commands, call };
}

const layersIn = (command: AssistantCommand | undefined) =>
	command?.kind === AssistantCommandKind.Batch ? command.commands.flatMap((step) => (step.kind === AssistantCommandKind.AddLayer && step.name ? [step.name] : [])) : [];

describe('drawing state, class and sequence diagrams through MCP', () => {
	it('draws each kind in one batch on its own layers', async () => {
		const { client, commands, call } = await connected();
		const diagrams = [
			['stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]', ['Connections', 'Nodes']],
			['classDiagram\n  Animal <|-- Duck', ['Connections', 'Nodes']],
			['sequenceDiagram\n  A->>B: hi', ['Lifelines', 'Messages', 'Participants']],
		] as const;
		for (const [diagram, layers] of diagrams) {
			expect((await call(EditingTool.Draw, { diagram })).isError).toBe(false);
			expect(layersIn(commands.at(-1))).toEqual(layers);
		}
		await client.close();
	});

	it('names the supported kinds when given another', async () => {
		const { client, commands, call } = await connected();
		expect(await call(EditingTool.Draw, { diagram: 'gantt\n  title Plan' })).toEqual({
			isError: true,
			text: 'Diagram: Line 1: Supported Mermaid diagrams start with flowchart, graph, stateDiagram-v2, classDiagram or sequenceDiagram.',
		});
		expect(commands).toHaveLength(0);
		await client.close();
	});

	it('draws a line with named ends', async () => {
		const { client, commands, call } = await connected();
		await call(EditingTool.AddLine, { from_x: 0, from_y: 0, to_x: 90, to_y: 0, color: '#000000', head: LineEnd.Triangle, tail: LineEnd.Diamond });
		expect(commands[0]).toMatchObject({ kind: AssistantCommandKind.AddLine, head: LineEnd.Triangle, tail: LineEnd.Diamond });
		expect((await call(EditingTool.AddLine, { from_x: 0, from_y: 0, to_x: 9, to_y: 0, color: '#000000', head: 'spiral' })).isError).toBe(true);
		await client.close();
	});
});
