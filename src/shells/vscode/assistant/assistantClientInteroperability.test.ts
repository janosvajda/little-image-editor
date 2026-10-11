import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parseToml } from '../extension/toml/tomlParser';
import { afterEach, describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../../app/core/document/appTypes';
import { ColorPalette } from '../../../app/core/document/colorPalette';
import { CanvasDocument } from '../../../app/core/document/imageDocument';
import { EditorHistory, HistoryDomain } from '../../../app/core/history/editorHistory';
import { AnnotationDocument } from '../../../app/features/annotations/annotationDocument';
import { AssistantCommandRunner } from '../../../app/features/assistant/assistantCommandRunner';
import { ProjectCodec } from '../../../app/features/projects/projectCodec';
import { ASSISTANT_SERVER_NAME, AssistantClient } from '../extension/assistantClients';
import { updateAssistantConfig } from '../extension/assistantConfig';
import { type RunningAssistantServer, startAssistantServer } from './assistantServer';
import { EditingTool } from './editingTools';
import type { EditableImages } from './openImages';

const parse = (source: string) => parseToml(source).value;

const Token = 'test-shared-editor-token';
const Identity = { name: ASSISTANT_SERVER_NAME, version: '0.3.1' } as const;
const Image = { id: 'untitled:assistant-drawing.limg', name: 'assistant-drawing.limg', location: 'untitled:assistant-drawing.limg', active: true } as const;
const Surface = { width: 64, height: 64 } as const;

let server: RunningAssistantServer | undefined;
let client: Client | undefined;

afterEach(async () => {
	await client?.close();
	await server?.close();
	client = undefined; server = undefined;
});

describe('assistant-independent layered drawing', () => {
	it.each(Object.values(AssistantClient))('draws editable layers through the registered %s connection and round-trips .limg', async (assistant) => {
		const model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
		const objects = new AnnotationDocument();
		const history = new EditorHistory({ [HistoryDomain.Document]: model, [HistoryDomain.Objects]: objects });
		const runner = new AssistantCommandRunner(model, objects, history);
		const images: EditableImages = {
			list: () => model.hasImage ? [Image] : [],
			view: async () => { throw new Error('Viewing is covered by the compositor browser tests.'); },
			create: async (name, spec) => { model.create({ name: name ?? Image.name, ...spec }); return Image; },
			command: async (_image, command) => runner.run(command),
		};
		server = await startAssistantServer({ port: 0, token: Token, images, identity: Identity });
		const source = updateAssistantConfig(assistant, undefined, { url: server.url, token: Token })!;
		const config: unknown = assistant === AssistantClient.Codex ? parse(source) : JSON.parse(source);
		const table = record(record(config)[assistant === AssistantClient.Codex ? 'mcp_servers' : 'mcpServers']);
		const entry = record(table[ASSISTANT_SERVER_NAME]);
		const headers = record(entry[assistant === AssistantClient.Codex ? 'http_headers' : 'headers']);
		client = new Client({ name: assistant, version: '1.0.0' });
		await client.connect(new StreamableHTTPClientTransport(new URL(String(entry.url)), { requestInit: { headers: { Authorization: String(headers.Authorization) } } }));
		const names = (await client.listTools()).tools.map((tool) => tool.name);
		for (const name of Object.values(EditingTool)) expect(names).toContain(name);
		expect((await client.callTool({ name: EditingTool.CreateImage, arguments: { name: Image.name, ...Surface } })).isError).not.toBe(true);
		for (const [layer, color, x] of [['Circles', ColorPalette.Red, 8], ['Apple', ColorPalette.EmeraldGreen, 32]] as const) {
			await client.callTool({ name: EditingTool.AddLayer, arguments: { image: Image.id, name: layer } });
			const result = await client.callTool({ name: EditingTool.AddShape, arguments: { image: Image.id, layer, shape: ShapeToolId.Ellipse, x, y: 8, width: 20, height: 20, color } });
			expect(result.isError).not.toBe(true);
		}
		expect(objects.state.layers.map((layer) => [layer.name, layer.itemIds.length])).toEqual([['Circles', 1], ['Apple', 1]]);
		const codec = new ProjectCodec();
		const project = codec.parse(codec.serialize(model.snapshotSession(), [], objects.snapshotSession()));
		expect(codec.toEditableObjects(project).state).toEqual(objects.state);
		await client.callTool({ name: EditingTool.AddText, arguments: { image: Image.id, layer: 'Apple', text: 'Editable', x: 32, y: 32, color: ColorPalette.Black } });
		expect(objects.state.objects).toHaveLength(3);
		await client.callTool({ name: EditingTool.Undo, arguments: { image: Image.id } });
		expect(objects.state.objects).toHaveLength(2);
	});
});

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a configuration table.');
	return value as Record<string, unknown>;
}
