import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, type Page, test } from '@playwright/test';
import { ShapeToolId } from '../../src/app/core/document/appTypes';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { MAX_CANVAS_DIMENSION } from '../../src/app/core/geometry/geometryHelpers';
import { type AssistantCommand, AssistantCommandKind, type AssistantResult } from '../../src/app/features/assistant/assistantCommandTypes';
import { startAssistantServer } from '../../src/shells/vscode/assistant/assistantServer';
import { EditingTool } from '../../src/shells/vscode/assistant/editingTools';
import { ExportTool } from '../../src/shells/vscode/assistant/exportTools';
import type { EditableImages, ExportableImages, OpenImageView } from '../../src/shells/vscode/assistant/openImages';
import { AssistantClient } from '../../src/shells/vscode/extension/assistantClients';
import { WorkspaceImageExporter } from '../../src/shells/vscode/extension/workspaceImageExporter';
import { HostMessageType, receivedFileBytes, WebviewMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview, sentToHost } from './support/vscodeWebview';

const Size = { width: 640, height: 480 } as const;
/** Larger than the assistant preview limit: exports must retain original resolution. */
const AssistantSize = { width: 2048, height: 1536 } as const;
const Image = { id: 'untitled:app-icon.limg', name: 'app-icon.limg', location: 'untitled:app-icon.limg', active: true } as const;
const Token = 'test-export-connection';

function editorBridge(page: Page) {
	let nextRequestId = 0;
	return {
		async command(command: AssistantCommand): Promise<AssistantResult> {
			const requestId = nextRequestId++;
			await sendToWebview(page, { type: HostMessageType.Command, requestId, command });
			await expect.poll(async () => (await sentToHost(page, WebviewMessageType.CommandDone)).some((answer) => answer.requestId === requestId)).toBe(true);
			const done = (await sentToHost(page, WebviewMessageType.CommandDone)).find((answer) => answer.requestId === requestId)!;
			if ('error' in done) throw new Error(done.error);
			return done.result;
		},
		async view(maxSize: number): Promise<OpenImageView> {
			const requestId = nextRequestId++;
			await sendToWebview(page, { type: HostMessageType.View, requestId, maxSize });
			await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Viewed)).some((answer) => answer.requestId === requestId)).toBe(true);
			const done = (await sentToHost(page, WebviewMessageType.Viewed)).find((answer) => answer.requestId === requestId)!;
			if ('error' in done) throw new Error(done.error);
			const { contents, ...sizes } = done.image;
			return { name: Image.name, png: receivedFileBytes(contents), ...sizes };
		},
	};
}

async function createImage(page: Page): Promise<void> {
	await sendToWebview(page, { type: HostMessageType.Create, fileName: Image.name, image: { ...Size, transparent: true, background: ColorPalette.White } });
	await expect(page.locator('#dimensions')).toHaveText(`${Size.width} × ${Size.height} px`);
}

async function drawLayers(command: (command: AssistantCommand) => Promise<AssistantResult>): Promise<void> {
	for (const [name, color, x] of [['Blue', ColorPalette.Blue, 20], ['Red', ColorPalette.Red, 120]] as const) {
		await command({ kind: AssistantCommandKind.AddLayer, name });
		await command({ kind: AssistantCommandKind.AddShape, layer: name, shape: ShapeToolId.Rectangle, color, rect: { x, y: 20, width: 60, height: 60 }, fill: true, strokeWidth: 4, opacity: 1, rotation: 0 });
	}
	await command({ kind: AssistantCommandKind.AddLayer, name: 'Hidden' });
	await command({ kind: AssistantCommandKind.AddShape, layer: 'Hidden', shape: ShapeToolId.Rectangle, color: ColorPalette.Lime, rect: { x: 220, y: 20, width: 60, height: 60 }, fill: true, strokeWidth: 4, opacity: 1, rotation: 0 });
}

async function hideLayer(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Layers & Objects', exact: true }).click();
	await page.getByRole('button', { name: 'Hide Hidden', exact: true }).click();
	await page.getByRole('button', { name: 'Layers & Objects', exact: true }).click();
}

async function checkPng(page: Page, contents: Uint8Array, size: Readonly<{ width: number; height: number }> = Size): Promise<void> {
	const pixels = await page.evaluate(async (bytes) => {
		const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width; canvas.height = bitmap.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(bitmap, 0, 0);
		const at = (x: number) => [...context.getImageData(x, 40, 1, 1).data];
		const result = { width: bitmap.width, height: bitmap.height, blue: at(40), red: at(140), hidden: at(240), background: at(400) };
		bitmap.close();
		return result;
	}, [...contents]);
	expect(pixels).toEqual({ ...size, blue: [0, 0, 255, 255], red: [255, 0, 0, 255], hidden: [0, 0, 0, 0], background: [0, 0, 0, 0] });
}

test('the VS Code export dialog writes visible layers at original size while keeping the project editable', async ({ page }) => {
	await openVsCodeWebview(page);
	await expect(page.getByRole('button', { name: 'Export image', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Export image', exact: true })).toBeDisabled();
	await createImage(page);
	const bridge = editorBridge(page);
	await drawLayers(bridge.command);
	await hideLayer(page);
	const before = await bridge.command({ kind: AssistantCommandKind.Describe });
	const changes = (await sentToHost(page, WebviewMessageType.Changed)).length;
	await page.getByRole('button', { name: 'Export image', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export image', exact: true });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('combobox', { name: 'Export file format' })).toHaveValue('image/png');
	await expect(dialog.locator('#exportImagePreview')).toHaveAttribute('src', /^blob:/);
	await page.screenshot({ path: 'test-results/image-export/dialog.png' });
	await dialog.getByRole('button', { name: 'Export PNG…' }).click();
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.PickSaveTarget)).length).toBe(1);
	const [picker] = await sentToHost(page, WebviewMessageType.PickSaveTarget);
	expect(picker).toMatchObject({ suggestedName: 'app-icon.png', filters: [{ description: 'PNG image', extensions: ['png'] }] });
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: picker!.requestId, value: { targetId: 'asset-copy', name: 'app-icon.png' } });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Write)).length).toBe(1);
	const [write] = await sentToHost(page, WebviewMessageType.Write);
	expect(write!.targetId).toBe('asset-copy');
	await checkPng(page, receivedFileBytes(write!.contents));
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: write!.requestId, value: true });
	await expect(dialog).toBeHidden();
	expect(await bridge.command({ kind: AssistantCommandKind.Describe })).toEqual(before);
	expect((await sentToHost(page, WebviewMessageType.Changed)).length).toBe(changes);
	expect(await sentToHost(page, WebviewMessageType.Saved)).toHaveLength(0);
	expect(await sentToHost(page, WebviewMessageType.Confirm)).toEqual([]);
});

test('a failed host write is reported in the export dialog and native cancellation writes nothing', async ({ page }) => {
	await openVsCodeWebview(page);
	await createImage(page);
	const dialog = page.getByRole('dialog', { name: 'Export image', exact: true });
	await page.getByRole('button', { name: 'Export image', exact: true }).click();
	await dialog.getByRole('button', { name: 'Export PNG…' }).click();
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.PickSaveTarget)).length).toBe(1);
	const [cancelled] = await sentToHost(page, WebviewMessageType.PickSaveTarget);
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: cancelled!.requestId, value: null });
	await expect(dialog).toBeHidden();
	expect(await sentToHost(page, WebviewMessageType.Write)).toHaveLength(0);
	await page.getByRole('button', { name: 'Export image', exact: true }).click();
	await dialog.getByRole('button', { name: 'Export PNG…' }).click();
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.PickSaveTarget)).length).toBe(2);
	const picker = (await sentToHost(page, WebviewMessageType.PickSaveTarget)).at(-1)!;
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: picker.requestId, value: { targetId: 'unwritable', name: 'app-icon.png' } });
	await expect.poll(async () => (await sentToHost(page, WebviewMessageType.Write)).length).toBe(1);
	const [write] = await sentToHost(page, WebviewMessageType.Write);
	await sendToWebview(page, { type: HostMessageType.Reply, requestId: write!.requestId, value: false, error: 'The folder is read-only.' });
	await expect(dialog.getByRole('alert')).toHaveText('The folder is read-only.');
	await expect(dialog.getByRole('button', { name: 'Export PNG…' })).toBeEnabled();
});

for (const assistant of Object.values(AssistantClient)) {
	test(`${assistant} can draw editable layers and export a real PNG into src/assets through MCP`, async ({ page }) => {
		await openVsCodeWebview(page);
		const bridge = editorBridge(page);
		const root = await mkdtemp(join(tmpdir(), 'little-image-editor-mcp-export-'));
		const writer = new WorkspaceImageExporter([{ name: 'Project', path: root }]);
		const images: EditableImages & ExportableImages = {
			list: () => [Image],
			view: (_image, maxSize) => bridge.view(maxSize),
			create: async (name, spec) => {
				await sendToWebview(page, { type: HostMessageType.Create, fileName: name ?? Image.name, image: spec });
				await expect(page.locator('#dimensions')).toHaveText(`${spec.width} × ${spec.height} px`);
				return Image;
			},
			command: (_image, command) => bridge.command(command),
			export: (_image, request) => writer.export(request, join(root, Image.name), () => bridge.view(MAX_CANVAS_DIMENSION)),
		};
		const server = await startAssistantServer({ port: 0, token: Token, images, identity: { name: 'little-image-editor', version: '0.3.2' } });
		const client = new Client({ name: assistant, version: '1.0.0' });
		try {
			await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: `Bearer ${Token}` } } }));
			expect((await client.listTools()).tools.map(({ name }) => name)).toContain(ExportTool.Image);
			expect((await client.callTool({ name: EditingTool.CreateImage, arguments: { name: Image.name, ...AssistantSize, transparent: true } })).isError).not.toBe(true);
			for (const [name, color, x] of [['Blue', ColorPalette.Blue, 20], ['Red', ColorPalette.Red, 120], ['Hidden', ColorPalette.Lime, 220]] as const) {
				expect((await client.callTool({ name: EditingTool.AddLayer, arguments: { image: Image.id, name } })).isError).not.toBe(true);
				expect((await client.callTool({ name: EditingTool.AddShape, arguments: { image: Image.id, layer: name, shape: ShapeToolId.Rectangle, color, x, y: 20, width: 60, height: 60 } })).isError).not.toBe(true);
			}
			await hideLayer(page);
			const before = await client.callTool({ name: EditingTool.DescribeImage, arguments: { image: Image.id } });
			const changes = (await sentToHost(page, WebviewMessageType.Changed)).length;
			const path = 'src/assets/app-icon.png';
			const result = await client.callTool({ name: ExportTool.Image, arguments: { image: Image.id, path } });
			expect(result.isError).not.toBe(true);
			expect(result.content).toEqual([expect.objectContaining({ type: 'text', text: expect.stringContaining(join(root, path)) })]);
			await checkPng(page, await readFile(join(root, path)), AssistantSize);
			const duplicate = await client.callTool({ name: ExportTool.Image, arguments: { image: Image.id, path } });
			expect(duplicate.isError).toBe(true);
			expect((await client.callTool({ name: ExportTool.Image, arguments: { image: Image.id, path, overwrite: true } })).isError).not.toBe(true);
			const invalid = await client.callTool({ name: ExportTool.Image, arguments: { image: Image.id, path: 'src/assets/app-icon.limg' } });
			expect(invalid.isError).toBe(true);
			expect(await client.callTool({ name: EditingTool.DescribeImage, arguments: { image: Image.id } })).toEqual(before);
			expect((await sentToHost(page, WebviewMessageType.Changed)).length).toBe(changes);
			expect(await sentToHost(page, WebviewMessageType.Saved)).toHaveLength(0);
		} finally {
			await client.close(); await server.close();
			await rm(root, { recursive: true, force: true });
		}
	});
}
